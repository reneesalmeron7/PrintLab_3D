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
    role: row.role
  };
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
    "SELECT id, username, email, role, password_hash FROM users WHERE username = ? LIMIT 1",
    [username]
  );
  const found = rows[0];
  const matches = found ? await bcrypt.compare(password, found.password_hash) : false;
  if (!found || !matches) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }

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

function me(req, res) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "No hay sesión." });
  }
  res.json({ user: req.session.user });
}

module.exports = { seedUsers, register, login, logout, me };
