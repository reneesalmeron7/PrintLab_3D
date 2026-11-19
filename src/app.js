const path = require("path");
const express = require("express");
const session = require("express-session");
const authRoutes = require("./routes/auth.routes");
const catalogRoutes = require("./routes/catalog.routes");
const invoicesRoutes = require("./routes/invoices.routes");

const app = express();
const root = path.join(__dirname, "..");
const pub  = path.join(root, "public");

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: "printlab.sid",
  secret: process.env.SESSION_SECRET || "cambia-este-secreto-en-el-laboratorio",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use("/api/auth", authRoutes);
app.use("/api", catalogRoutes);
app.use("/api", invoicesRoutes);

// Proteger vistas restringidas por rol en el servidor
app.get(["/admin.html", "/admin"], (req, res, next) => {
  if (!req.session?.user || req.session.user.role !== "admin") {
    return res.redirect("/acceso.html");
  }
  next();
});

app.get(["/vendedor.html", "/vendedor"], (req, res, next) => {
  if (!req.session?.user || !["vendedor", "admin"].includes(req.session.user.role)) {
    return res.redirect("/acceso.html");
  }
  next();
});

// Bloquear acceso a carpetas internas del servidor
app.use((req, res, next) => {
  const blocked = req.path.startsWith("/src")
    || req.path.startsWith("/sql")
    || req.path.startsWith("/scripts")
    || req.path.startsWith("/node_modules")
    || req.path.includes(".env")
    || req.path.endsWith(".yml")
    || req.path.endsWith(".yaml")
    || req.path.endsWith(".json")
    || req.path.endsWith(".md");
  if (blocked) return res.status(404).end();
  next();
});

// Servir carpeta public/ como raíz web (HTML, JS, CSS, assets)
app.use(express.static(pub, { dotfiles: "ignore", index: "index.html" }));

// Fallback: redirigir rutas desconocidas al index
app.use((req, res) => {
  res.sendFile(path.join(pub, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error del servidor." });
});

module.exports = app;
