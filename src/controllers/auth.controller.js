const bcrypt = require("bcrypt");
const pool = require("../config/db");

const SEED_USERS = [
  ["cliente", "cliente123", "cliente@printlab.local", "comprador"],
  ["vendedor", "vendedor123", "vendedor@printlab.local", "vendedor"],
  ["admin", "admin123", "admin@printlab.local", "admin"]
];

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    active: row.active === undefined ? true : Boolean(row.active)
  };
}

async function ensureActiveColumn() {
  const [columns] = await pool.query("SHOW COLUMNS FROM users LIKE 'active'");
  if (columns.length > 0) return;
  await pool.query("ALTER TABLE users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1");
}

async function ensureLoginFailuresTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_failures (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      forwarded_for VARCHAR(255) NULL,
      user_agent VARCHAR(255) NULL,
      reason ENUM('usuario_inexistente', 'contrasena_incorrecta', 'cuenta_desactivada', 'exitoso') NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    ALTER TABLE login_failures
    MODIFY reason ENUM('usuario_inexistente', 'contrasena_incorrecta', 'cuenta_desactivada', 'exitoso') NOT NULL
  `);
}

function attemptContext(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const agent = req.headers["user-agent"];
  return {
    ip: String(req.ip || (req.socket && req.socket.remoteAddress) || "").slice(0, 45) || "desconocida",
    forwardedFor: typeof forwarded === "string" ? forwarded.slice(0, 255) : null,
    userAgent: typeof agent === "string" ? agent.slice(0, 255) : null
  };
}

async function recordLoginAttempt(req, username, reason) {
  const context = attemptContext(req);
  await pool.execute(
    `INSERT INTO login_failures (username, ip_address, forwarded_for, user_agent, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [String(username).slice(0, 255), context.ip, context.forwardedFor, context.userAgent, reason]
  );
}

async function seedUsers() {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM users");
  if (Number(rows[0].total) > 0) return;

  for (const [username, password, email, role] of SEED_USERS) {
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.execute(
      "INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)",
      [username, passwordHash, email, role]
    );
  }
  console.log("Cuentas de prueba insertadas: cliente, vendedor y admin.");
}

async function register(req, res) {
  const username = String(req.body.username || "").trim();
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Usuario, correo y contraseña son obligatorios." });
  }
  if (username.length > 50 || email.length > 100) {
    return res.status(400).json({ error: "Usuario o correo demasiado largo." });
  }

  const [existing] = await pool.execute(
    "SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1",
    [username, email]
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: "Ese usuario o correo ya existe." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await pool.execute(
    "INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, 'comprador')",
    [username, passwordHash, email]
  );

  const user = { id: result.insertId, username, email, role: "comprador" };
  req.session.user = user;
  res.status(201).json({ user });
}

async function login(req, res) {
  // Sin límite de intentos, bloqueo, retardo ni CAPTCHA.
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!username || !password) {
    return res.status(400).json({ error: "Usuario y contraseña son obligatorios." });
  }

  const [rows] = await pool.execute(
    "SELECT id, username, email, role, active, password_hash FROM users WHERE username = ? LIMIT 1",
    [username]
  );
  const found = rows[0];
  const matches = found ? await bcrypt.compare(password, found.password_hash) : false;
  if (!found || !matches) {
    await recordLoginAttempt(req, username, found ? "contrasena_incorrecta" : "usuario_inexistente");
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }
  if (!found.active) {
    await recordLoginAttempt(req, username, "cuenta_desactivada");
    return res.status(403).json({ error: "Esta cuenta está desactivada." });
  }

  await recordLoginAttempt(req, username, "exitoso");
  const user = publicUser(found);
  req.session.user = user;
  res.json({ user });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie("printlab.sid");
    res.json({ ok: true });
  });
}

async function listLoginFailures(req, res) {
  const [rows] = await pool.query(
    `SELECT id, username, ip_address, forwarded_for, user_agent, reason, created_at
     FROM login_failures
     ORDER BY id DESC
     LIMIT 200`
  );
  const attempts = rows.map((row) => ({
    id: row.id,
    username: row.username,
    ip: row.ip_address,
    forwardedFor: row.forwarded_for,
    userAgent: row.user_agent,
    reason: row.reason,
    createdAt: row.created_at
  }));
  res.json({ attempts });
}

async function listUsers(req, res) {
  const [rows] = await pool.query(
    "SELECT id, username, email, role, active FROM users ORDER BY id"
  );
  res.json({ users: rows.map(publicUser) });
}

async function updateUser(req, res) {
  const id = Number(req.params.id);
  const [rows] = await pool.execute(
    "SELECT id, username, email, role, active FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  const current = rows[0];
  if (!current) return res.status(404).json({ error: "Usuario no encontrado." });

  let role = current.role;
  if (req.body.role !== undefined) {
    role = String(req.body.role);
    if (!["comprador", "vendedor", "admin"].includes(role)) {
      return res.status(400).json({ error: "Rol no permitido." });
    }
  }

  let active = Boolean(current.active);
  if (req.body.active !== undefined) {
    if (req.session.user.id === current.id) {
      return res.status(400).json({ error: "No puedes desactivar la cuenta con la que entraste." });
    }
    active = Boolean(req.body.active);
  }

  await pool.execute(
    "UPDATE users SET role = ?, active = ? WHERE id = ?",
    [role, active ? 1 : 0, id]
  );
  if (req.session.user.id === current.id) req.session.user.role = role;

  const [updated] = await pool.execute(
    "SELECT id, username, email, role, active FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  res.json({ user: publicUser(updated[0]) });
}

function me(req, res) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "No hay sesión." });
  }
  res.json({ user: req.session.user });
}

module.exports = {
  seedUsers,
  ensureActiveColumn,
  ensureLoginFailuresTable,
  register,
  login,
  logout,
  me,
  listUsers,
  updateUser,
  listLoginFailures
};
