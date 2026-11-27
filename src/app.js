const path = require("path");
const express = require("express");
const session = require("express-session");
const authRoutes = require("./routes/auth.routes");
const catalogRoutes = require("./routes/catalog.routes");
const invoicesRoutes = require("./routes/invoices.routes");
const requestsRoutes = require("./routes/requests.routes");

const app = express();
const root = path.join(__dirname, "..");
const pub  = path.join(root, "public");

app.disable("x-powered-by");
app.set("trust proxy", 1);

// Cabeceras de seguridad HTTP (CSP, anti-clickjacking, anti-MIME sniffing)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join("; ");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", CSP);
  next();
});

// Protección CSRF adicional: bloquear peticiones mutadoras de orígenes externos
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers.origin) {
    try {
      const originHost = new URL(req.headers.origin).host;
      if (originHost !== req.headers.host) {
        return res.status(403).json({ error: "Origen no permitido." });
      }
    } catch {
      return res.status(403).json({ error: "Origen inválido." });
    }
  }
  next();
});

const jsonDefault = express.json({ limit: "2mb" });
const jsonLarge = express.json({ limit: "15mb" });
app.use((req, res, next) => {
  if (req.path === "/api/requests" && req.method === "POST") {
    return jsonLarge(req, res, next);
  }
  return jsonDefault(req, res, next);
});
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
app.use("/api", requestsRoutes);

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
    || req.path.startsWith("/uploads")
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
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "El archivo supera el tamaño máximo permitido (10 MB)." });
  }
  console.error(err);
  res.status(500).json({ error: "Error del servidor." });
});

module.exports = app;
