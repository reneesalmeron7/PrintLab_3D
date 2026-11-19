const pool = require("../config/db");

const MATERIALS = ["PLA", "PETG", "ABS"];
const VENDOR_STATES = ["pendiente", "cotizada", "imprimiendo", "lista"];
const ADMIN_STATES = VENDOR_STATES.concat("rechazada");

function publicRequest(row) {
  return {
    id: row.id,
    pieza: row.title || "",
    material: row.material || "",
    descripcion: row.description || "",
    usuario: row.username || "",
    archivo: row.reference_file || "",
    estado: row.status,
    precio: row.quote_price == null ? null : Number(row.quote_price)
  };
}

async function ensureRequestShape() {
  const [title] = await pool.query("SHOW COLUMNS FROM custom_requests LIKE 'title'");
  if (title.length === 0) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN title VARCHAR(120) NULL AFTER user_id");
  }
  const [material] = await pool.query("SHOW COLUMNS FROM custom_requests LIKE 'material'");
  if (material.length === 0) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN material VARCHAR(20) NULL AFTER title");
  }
  await pool.query(`
    ALTER TABLE custom_requests
    MODIFY status ENUM(
      'pendiente', 'cotizada', 'imprimiendo', 'lista',
      'en_proceso', 'completada', 'rechazada'
    ) NOT NULL DEFAULT 'pendiente'
  `);
  const [price] = await pool.query("SHOW COLUMNS FROM custom_requests LIKE 'quote_price'");
  if (price.length === 0) {
    await pool.query("ALTER TABLE custom_requests ADD COLUMN quote_price DECIMAL(10,2) NULL AFTER status");
  }
}

async function seedRequest() {
  const [count] = await pool.query("SELECT COUNT(*) AS total FROM custom_requests");
  if (Number(count[0].total) > 0) return;
  const [buyers] = await pool.execute(
    "SELECT id FROM users WHERE username = 'cliente' LIMIT 1"
  );
  if (buyers.length === 0) return;
  await pool.execute(
    `INSERT INTO custom_requests (user_id, title, material, description, reference_file, status)
     VALUES (?, ?, ?, ?, ?, 'pendiente')`,
    [
      buyers[0].id,
      "Soporte para audífonos",
      "PLA",
      "Gancho de 8 cm para el borde del escritorio.",
      ""
    ]
  );
}

async function listOwnRequests(req, res) {
  const [rows] = await pool.execute(
    `SELECT r.id, r.title, r.material, r.description, r.reference_file, r.status, r.quote_price, u.username
     FROM custom_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.user_id = ?
     ORDER BY r.id DESC`,
    [req.session.user.id]
  );
  res.set("Cache-Control", "no-store");
  res.json({ requests: rows.map(publicRequest) });
}

async function listRequests(req, res) {
  const [rows] = await pool.query(
    `SELECT r.id, r.title, r.material, r.description, r.reference_file, r.status, r.quote_price, u.username
     FROM custom_requests r
     JOIN users u ON u.id = r.user_id
     ORDER BY r.id DESC`
  );
  res.set("Cache-Control", "no-store");
  res.json({ requests: rows.map(publicRequest) });
}

async function createRequest(req, res) {
  const pieza = String(req.body.pieza || "").trim();
  const material = String(req.body.material || "");
  const descripcion = String(req.body.descripcion || "").trim();
  const archivo = String(req.body.archivo || "").trim().slice(0, 255);

  if (!pieza || pieza.length > 120) {
    return res.status(400).json({ error: "El nombre de la pieza es obligatorio." });
  }
  if (!MATERIALS.includes(material)) {
    return res.status(400).json({ error: "El material no es válido." });
  }
  if (!descripcion) {
    return res.status(400).json({ error: "La descripción es obligatoria." });
  }

  const [created] = await pool.execute(
    `INSERT INTO custom_requests (user_id, title, material, description, reference_file, status)
     VALUES (?, ?, ?, ?, ?, 'pendiente')`,
    [req.session.user.id, pieza, material, descripcion, archivo]
  );
  const [rows] = await pool.execute(
    `SELECT r.id, r.title, r.material, r.description, r.reference_file, r.status, r.quote_price, u.username
     FROM custom_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.id = ?`,
    [created.insertId]
  );
  res.status(201).json({ request: publicRequest(rows[0]) });
}

async function updateRequestStatus(req, res) {
  const estado = String(req.body.estado || "");
  const allowed = req.session.user.role === "admin" ? ADMIN_STATES : VENDOR_STATES;
  if (!allowed.includes(estado)) {
    return res.status(400).json({ error: "Ese estado no está permitido." });
  }
  const id = Number(req.params.id);
  if (estado === "cotizada") {
    const precio = Number(req.body.precio);
    if (!Number.isFinite(precio) || precio < 0 || precio > 99999999.99) {
      return res.status(400).json({ error: "Indica el precio de la cotización." });
    }
    const quote = Math.round(precio * 100) / 100;
    const [result] = await pool.execute(
      "UPDATE custom_requests SET status = ?, quote_price = ? WHERE id = ?",
      [estado, quote, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Solicitud no encontrada." });
    }
    return res.json({ ok: true, estado, precio: quote });
  }
  const [result] = await pool.execute(
    "UPDATE custom_requests SET status = ? WHERE id = ?",
    [estado, id]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "Solicitud no encontrada." });
  }
  res.json({ ok: true, estado });
}

module.exports = {
  ensureRequestShape,
  seedRequest,
  listOwnRequests,
  listRequests,
  createRequest,
  updateRequestStatus
};
