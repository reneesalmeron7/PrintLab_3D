const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../config/db");

const UPLOADS_DIR = path.join(__dirname, "../../uploads/requests");
const MATERIALS = ["PLA", "PETG", "ABS"];
const ALL_STATES = ["pendiente", "cotizada", "en_cola", "imprimiendo", "lista", "cancelada", "rechazada"];
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

function formatPrice(val) {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

function publicHistoryRow(h) {
  return {
    id: h.id,
    changedBy: h.changed_by || "taller",
    status: h.status,
    quotePrice: formatPrice(h.quote_price),
    comment: h.comment || "",
    createdAt: h.created_at
  };
}

function publicRequest(row, historyRows = []) {
  return {
    id: row.id,
    piece: row.piece_name || ("Solicitud #" + row.id),
    material: row.material || "PLA",
    description: row.description || "",
    username: row.username || "usuario",
    fileName: row.reference_file || "",
    hasFile: hasStoredFileOnDisk(row.stored_file),
    status: row.status || "pendiente",
    quotePrice: formatPrice(row.quote_price),
    sellerNote: row.seller_note || "",
    createdAt: row.created_at,
    notifiedAt: row.notified_at || null,
    history: historyRows.map(publicHistoryRow)
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
  if (!colMap.has("quote_price")) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN quote_price DECIMAL(10,2) NULL AFTER status");
  }
  if (!colMap.has("seller_note")) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN seller_note TEXT NULL AFTER quote_price");
  }
  if (!colMap.has("notified_at")) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN notified_at TIMESTAMP NULL DEFAULT NULL AFTER seller_note");
  }

  const statusCol = colMap.get("status");
  const statusType = statusCol ? String(statusCol.Type).toLowerCase() : "";
  if (
    !statusType.includes("'cotizada'")
    || !statusType.includes("'en_cola'")
    || !statusType.includes("'cancelada'")
    || statusType.includes("'aceptada'")
    || statusType.includes("'en_proceso'")
    || statusType.includes("'completada'")
  ) {
    await pool.query(
      "ALTER TABLE custom_requests MODIFY status ENUM('pendiente', 'cotizada', 'aceptada', 'en_cola', 'imprimiendo', 'lista', 'cancelada', 'rechazada', 'en_proceso', 'completada') NOT NULL DEFAULT 'pendiente'"
    );
    await pool.query("UPDATE custom_requests SET status = 'imprimiendo' WHERE status = 'en_proceso'");
    await pool.query("UPDATE custom_requests SET status = 'lista' WHERE status = 'completada'");
    await pool.query("UPDATE custom_requests SET status = 'en_cola' WHERE status = 'aceptada'");
    await pool.query(
      "ALTER TABLE custom_requests MODIFY status ENUM('pendiente', 'cotizada', 'en_cola', 'imprimiendo', 'lista', 'cancelada', 'rechazada') NOT NULL DEFAULT 'pendiente'"
    );
  }

  await pool.query(
    `UPDATE custom_requests
     SET piece_name = LEFT(TRIM(SUBSTRING_INDEX(description, '.', 1)), 80)
     WHERE piece_name = '' AND description IS NOT NULL AND description <> ''`
  );

  // Tabla de historial de movimientos por solicitud
  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_request_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      changed_by VARCHAR(50) NOT NULL,
      status ENUM('pendiente', 'cotizada', 'en_cola', 'imprimiendo', 'lista', 'cancelada', 'rechazada') NOT NULL,
      quote_price DECIMAL(10,2) NULL,
      comment TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES custom_requests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  const [histCols] = await pool.query("SHOW COLUMNS FROM custom_request_history LIKE 'status'");
  const histStatusType = histCols[0] ? String(histCols[0].Type).toLowerCase() : "";
  if (!histStatusType.includes("'en_cola'") || !histStatusType.includes("'cancelada'") || histStatusType.includes("'aceptada'")) {
    await pool.query(
      "ALTER TABLE custom_request_history MODIFY status ENUM('pendiente', 'cotizada', 'aceptada', 'en_cola', 'imprimiendo', 'lista', 'cancelada', 'rechazada') NOT NULL"
    );
    await pool.query("UPDATE custom_request_history SET status = 'en_cola' WHERE status = 'aceptada'");
    await pool.query(
      "ALTER TABLE custom_request_history MODIFY status ENUM('pendiente', 'cotizada', 'en_cola', 'imprimiendo', 'lista', 'cancelada', 'rechazada') NOT NULL"
    );
  }

  // Backfill de historial inicial para solicitudes que aún no tengan registro en historial
  const [missingHistory] = await pool.query(`
    SELECT r.id, r.status, r.quote_price, r.seller_note, r.created_at, r.notified_at, u.username
    FROM custom_requests r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN custom_request_history h ON h.request_id = r.id
    WHERE h.id IS NULL
  `);

  for (const row of missingHistory) {
    await pool.execute(
      `INSERT INTO custom_request_history (request_id, changed_by, status, quote_price, comment, created_at)
       VALUES (?, ?, 'pendiente', NULL, 'Solicitud enviada', ?)`,
      [row.id, row.username, row.created_at]
    );
    if (row.status !== "pendiente" || row.seller_note || row.quote_price !== null) {
      await pool.execute(
        `INSERT INTO custom_request_history (request_id, changed_by, status, quote_price, comment, created_at)
         VALUES (?, 'taller', ?, ?, ?, ?)`,
        [row.id, row.status, row.quote_price, row.seller_note || null, row.notified_at || row.created_at]
      );
    }
  }
}

async function historyForRequests(requestIds) {
  const map = new Map();
  if (!requestIds.length) return map;
  const placeholders = requestIds.map(() => "?").join(",");
  const [rows] = await pool.execute(
    `SELECT id, request_id, changed_by, status, quote_price, comment, created_at
     FROM custom_request_history
     WHERE request_id IN (${placeholders})
     ORDER BY id DESC`,
    requestIds
  );
  for (const row of rows) {
    if (!map.has(row.request_id)) map.set(row.request_id, []);
    map.get(row.request_id).push(row);
  }
  return map;
}

async function requestById(id) {
  const [rows] = await pool.execute(
    `SELECT r.id, r.user_id, r.piece_name, r.material, r.description,
            r.reference_file, r.stored_file, r.status, r.quote_price, r.seller_note,
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

  if (statusFilter && statusFilter !== "todos" && ALL_STATES.includes(statusFilter)) {
    conditions.push("r.status = ?");
    params.push(statusFilter);
  }

  const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const [rows] = await pool.execute(
    `SELECT r.id, r.user_id, r.piece_name, r.material, r.description,
            r.reference_file, r.stored_file, r.status, r.quote_price, r.seller_note,
            r.created_at, r.notified_at, u.username
     FROM custom_requests r
     JOIN users u ON u.id = r.user_id
     ${whereClause}
     ORDER BY r.id DESC`,
    params
  );

  const histMap = await historyForRequests(rows.map((r) => r.id));

  res.set("Cache-Control", "no-store");
  res.json({
    requests: rows.map((row) => publicRequest(row, histMap.get(row.id) || []))
  });
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

  await pool.execute(
    `INSERT INTO custom_request_history (request_id, changed_by, status, quote_price, comment)
     VALUES (?, ?, 'pendiente', NULL, 'Solicitud enviada')`,
    [created.insertId, req.session.user.username]
  );

  const saved = await requestById(created.insertId);
  const histMap = await historyForRequests([created.insertId]);
  res.status(201).json({ request: publicRequest(saved, histMap.get(created.insertId) || []) });
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

  if (existing.status === "cancelada") {
    return res.status(409).json({ error: "Esta solicitud fue cancelada por el cliente y no puede modificarse." });
  }

  const allowedStates = (req.session.user.role === "admin" ? ADMIN_STATES : VENDOR_STATES).slice();
  // Si ya está en cola de pedidos (aceptada por el cliente), permitir guardar un comentario manteniéndola ahí
  if (existing.status === "en_cola") allowedStates.push("en_cola");

  const nextStatus = req.body?.status !== undefined ? String(req.body.status).trim() : existing.status;

  if (!allowedStates.includes(nextStatus)) {
    return res.status(400).json({ error: "Estado no permitido para tu rol." });
  }

  if (existing.status === "cotizada" && ["imprimiendo", "lista"].includes(nextStatus)) {
    return res.status(409).json({
      error: "El cliente debe aceptar la cotización antes de pasar el pedido a impresión."
    });
  }

  let nextPrice = formatPrice(existing.quote_price);
  let historyPrice = null;

  if (nextStatus === "cotizada") {
    const rawPrice = req.body?.quotePrice;
    const parsedPrice = Number(rawPrice);
    if (rawPrice === undefined || rawPrice === null || rawPrice === "" || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: "Ingresa un precio numérico válido para la cotización." });
    }
    nextPrice = Math.round(parsedPrice * 100) / 100;
    historyPrice = nextPrice;
  } else if (req.body?.quotePrice !== undefined && req.body?.quotePrice !== null && req.body?.quotePrice !== "") {
    const parsedPrice = Number(req.body.quotePrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: "El precio ingresado no es válido." });
    }
    nextPrice = Math.round(parsedPrice * 100) / 100;
    historyPrice = nextPrice;
  }

  const sellerNote = req.body?.sellerNote !== undefined
    ? String(req.body.sellerNote || "").trim().slice(0, 500)
    : "";

  await pool.execute(
    `UPDATE custom_requests
     SET status = ?, quote_price = ?, seller_note = ?, notified_at = NOW()
     WHERE id = ?`,
    [nextStatus, nextPrice, sellerNote || null, id]
  );

  await pool.execute(
    `INSERT INTO custom_request_history (request_id, changed_by, status, quote_price, comment)
     VALUES (?, ?, ?, ?, ?)`,
    [id, req.session.user.username, nextStatus, historyPrice, sellerNote || null]
  );

  const updated = await requestById(id);
  const histMap = await historyForRequests([id]);
  res.json({ request: publicRequest(updated, histMap.get(id) || []) });
}

async function respondToRequest(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID de solicitud inválido." });
  }

  const existing = await requestById(id);
  if (!existing) {
    return res.status(404).json({ error: "Solicitud no encontrada." });
  }

  const user = req.session.user;
  if (existing.user_id !== user.id) {
    return res.status(403).json({ error: "Solo el titular de la solicitud puede realizar esta acción." });
  }

  const action = String(req.body?.action || "").trim().toLowerCase();
  if (action !== "accept" && action !== "cancel") {
    return res.status(400).json({ error: "Acción no válida." });
  }

  if (action === "accept") {
    if (existing.status !== "cotizada") {
      return res.status(409).json({ error: "Solo puedes aceptar una solicitud cuando ya está cotizada." });
    }
    await pool.execute(
      `UPDATE custom_requests
       SET status = 'en_cola', seller_note = NULL, notified_at = NOW()
       WHERE id = ?`,
      [id]
    );
    await pool.execute(
      `INSERT INTO custom_request_history (request_id, changed_by, status, quote_price, comment)
       VALUES (?, ?, 'en_cola', ?, 'Cotización aceptada por el cliente — pasó a cola de pedidos')`,
      [id, user.username, formatPrice(existing.quote_price)]
    );
  } else {
    if (!["pendiente", "cotizada"].includes(existing.status)) {
      return res.status(409).json({ error: "Esta solicitud ya no se puede cancelar en su estado actual." });
    }
    await pool.execute(
      `UPDATE custom_requests
       SET status = 'cancelada', seller_note = NULL, notified_at = NOW()
       WHERE id = ?`,
      [id]
    );
    await pool.execute(
      `INSERT INTO custom_request_history (request_id, changed_by, status, quote_price, comment)
       VALUES (?, ?, 'cancelada', NULL, 'Solicitud cancelada por el cliente')`,
      [id, user.username]
    );
  }

  const updated = await requestById(id);
  const histMap = await historyForRequests([id]);
  res.json({ request: publicRequest(updated, histMap.get(id) || []) });
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
  respondToRequest,
  downloadRequestFile
};
