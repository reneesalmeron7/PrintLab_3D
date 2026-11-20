const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../config/db");

const UPLOADS_DIR = path.join(__dirname, "../../uploads/requests");
const MATERIALS = ["PLA", "PETG", "ABS"];
const VENDOR_STATES = ["pendiente", "cotizada", "imprimiendo", "lista"];
const ADMIN_STATES = ["pendiente", "cotizada", "imprimiendo", "lista", "rechazada"];
const ALLOWED_EXTS = new Set([".stl", ".obj", ".3mf", ".png", ".jpg", ".jpeg", ".webp"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function ensureUploadsDir() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function sanitizeDisplayName(rawName) {
  const base = path.basename(String(rawName || "")).replace(/[\r\n"\\/:*?<>|]/g, "_").trim();
  return base.slice(0, 180) || "archivo";
}

function hasStoredFileOnDisk(storedFile) {
  if (!storedFile) return false;
  const safeName = path.basename(String(storedFile));
  if (!safeName || safeName !== storedFile) return false;
  return fs.existsSync(path.join(UPLOADS_DIR, safeName));
}

function publicRequest(row) {
  return {
    id: row.id,
    piece: row.piece_name || ("Solicitud #" + row.id),
    material: row.material || "PLA",
    description: row.description || "",
    username: row.username || "usuario",
    fileName: row.reference_file || "",
    hasFile: hasStoredFileOnDisk(row.stored_file),
    status: row.status || "pendiente",
    sellerNote: row.seller_note || "",
    createdAt: row.created_at,
    notifiedAt: row.notified_at || null
  };
}

async function ensureRequestsSchema() {
  ensureUploadsDir();

  const [columns] = await pool.query("SHOW COLUMNS FROM custom_requests");
  const colMap = new Map(columns.map((c) => [c.Field, c]));

  if (!colMap.has("piece_name")) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN piece_name VARCHAR(120) NOT NULL DEFAULT '' AFTER user_id");
  }
  if (!colMap.has("material")) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN material ENUM('PLA', 'PETG', 'ABS') NOT NULL DEFAULT 'PLA' AFTER piece_name");
  }
  if (!colMap.has("stored_file")) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN stored_file VARCHAR(255) NULL AFTER reference_file");
  }
  if (!colMap.has("seller_note")) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN seller_note TEXT NULL AFTER status");
  }
  if (!colMap.has("notified_at")) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN notified_at TIMESTAMP NULL DEFAULT NULL AFTER seller_note");
  }

  const statusCol = colMap.get("status");
  const statusType = statusCol ? String(statusCol.Type).toLowerCase() : "";
  if (!statusType.includes("'cotizada'") || statusType.includes("'en_proceso'") || statusType.includes("'completada'")) {
    await pool.query(
      "ALTER TABLE custom_requests MODIFY status ENUM('pendiente', 'cotizada', 'imprimiendo', 'lista', 'rechazada', 'en_proceso', 'completada') NOT NULL DEFAULT 'pendiente'"
    );
    await pool.query("UPDATE custom_requests SET status = 'imprimiendo' WHERE status = 'en_proceso'");
    await pool.query("UPDATE custom_requests SET status = 'lista' WHERE status = 'completada'");
    await pool.query(
      "ALTER TABLE custom_requests MODIFY status ENUM('pendiente', 'cotizada', 'imprimiendo', 'lista', 'rechazada') NOT NULL DEFAULT 'pendiente'"
    );
  }

  // Rellenar nombres de pieza vacíos en registros antiguos
  await pool.query(
    `UPDATE custom_requests
     SET piece_name = LEFT(TRIM(SUBSTRING_INDEX(description, '.', 1)), 80)
     WHERE piece_name = '' AND description IS NOT NULL AND description <> ''`
  );
}

async function requestById(id) {
  const [rows] = await pool.execute(
    `SELECT r.id, r.user_id, r.piece_name, r.material, r.description,
            r.reference_file, r.stored_file, r.status, r.seller_note,
            r.created_at, r.notified_at, u.username
     FROM custom_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function listRequests(req, res) {
  const user = req.session.user;
  const isStaff = ["vendedor", "admin"].includes(user.role);
  const statusFilter = req.query.status ? String(req.query.status).trim() : "";

  const conditions = [];
  const params = [];

  if (!isStaff) {
    conditions.push("r.user_id = ?");
    params.push(user.id);
  }

  if (statusFilter && statusFilter !== "todos" && ADMIN_STATES.includes(statusFilter)) {
    conditions.push("r.status = ?");
    params.push(statusFilter);
  }

  const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const [rows] = await pool.execute(
    `SELECT r.id, r.user_id, r.piece_name, r.material, r.description,
            r.reference_file, r.stored_file, r.status, r.seller_note,
            r.created_at, r.notified_at, u.username
     FROM custom_requests r
     JOIN users u ON u.id = r.user_id
     ${whereClause}
     ORDER BY r.id DESC`,
    params
  );

  res.set("Cache-Control", "no-store");
  res.json({ requests: rows.map(publicRequest) });
}

async function createRequest(req, res) {
  const piece = String(req.body?.piece || "").trim();
  const material = String(req.body?.material || "").trim();
  const description = String(req.body?.description || "").trim();
  const fileObj = req.body?.file || null;

  if (!piece || piece.length > 120) {
    return res.status(400).json({ error: "El nombre de la pieza es obligatorio (máx. 120 caracteres)." });
  }
  if (!MATERIALS.includes(material)) {
    return res.status(400).json({ error: "El material no es válido." });
  }
  if (!description || description.length > 1000) {
    return res.status(400).json({ error: "La descripción es obligatoria (máx. 1000 caracteres)." });
  }

  let referenceFile = null;
  let storedFile = null;

  if (fileObj && fileObj.name && fileObj.data) {
    const cleanName = sanitizeDisplayName(fileObj.name);
    const ext = path.extname(cleanName).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return res.status(400).json({
        error: "Tipo de archivo no permitido. Usa .stl, .obj, .3mf, .png, .jpg o .webp."
      });
    }

    const rawData = String(fileObj.data);
    const base64Part = rawData.includes(",") ? rawData.split(",").pop() : rawData;
    const buffer = Buffer.from(base64Part, "base64");

    if (buffer.length === 0) {
      return res.status(400).json({ error: "El archivo está vacío." });
    }
    if (buffer.length > MAX_FILE_BYTES) {
      return res.status(413).json({ error: "El archivo supera el límite máximo de 10 MB." });
    }

    ensureUploadsDir();
    storedFile = crypto.randomBytes(16).toString("hex") + ext;
    fs.writeFileSync(path.join(UPLOADS_DIR, storedFile), buffer);
    referenceFile = cleanName;
  }

  const [created] = await pool.execute(
    `INSERT INTO custom_requests
      (user_id, piece_name, material, description, reference_file, stored_file, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pendiente')`,
    [req.session.user.id, piece, material, description, referenceFile, storedFile]
  );

  const saved = await requestById(created.insertId);
  res.status(201).json({ request: publicRequest(saved) });
}

async function updateRequest(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID de solicitud inválido." });
  }

  const existing = await requestById(id);
  if (!existing) {
    return res.status(404).json({ error: "Solicitud no encontrada." });
  }

  const allowedStates = req.session.user.role === "admin" ? ADMIN_STATES : VENDOR_STATES;
  const nextStatus = req.body?.status !== undefined ? String(req.body.status).trim() : existing.status;

  if (!allowedStates.includes(nextStatus)) {
    return res.status(400).json({ error: "Estado no permitido para tu rol." });
  }

  const sellerNote = req.body?.sellerNote !== undefined
    ? String(req.body.sellerNote || "").trim().slice(0, 500)
    : (existing.seller_note || "");

  await pool.execute(
    `UPDATE custom_requests
     SET status = ?, seller_note = ?, notified_at = NOW()
     WHERE id = ?`,
    [nextStatus, sellerNote || null, id]
  );

  const updated = await requestById(id);
  res.json({ request: publicRequest(updated) });
}

async function downloadRequestFile(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID de solicitud inválido." });
  }

  const row = await requestById(id);
  if (!row) {
    return res.status(404).json({ error: "Solicitud no encontrada." });
  }

  const user = req.session.user;
  const isStaff = ["vendedor", "admin"].includes(user.role);
  if (!isStaff && row.user_id !== user.id) {
    return res.status(403).json({ error: "No tienes permiso para descargar este archivo." });
  }

  if (!hasStoredFileOnDisk(row.stored_file)) {
    return res.status(404).json({ error: "Este registro no tiene un archivo descargable adjunto." });
  }

  const fullPath = path.join(UPLOADS_DIR, path.basename(row.stored_file));
  const downloadName = sanitizeDisplayName(row.reference_file || row.stored_file);
  const asciiName = downloadName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
  );

  const stream = fs.createReadStream(fullPath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).json({ error: "No se pudo leer el archivo." });
  });
  stream.pipe(res);
}

module.exports = {
  ensureRequestsSchema,
  listRequests,
  createRequest,
  updateRequest,
  downloadRequestFile
};
