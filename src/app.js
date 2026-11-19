const path = require("path");
const express = require("express");
const session = require("express-session");
const authRoutes = require("./routes/auth.routes");
const catalogRoutes = require("./routes/catalog.routes");

const app = express();
const root = path.join(__dirname, "..");

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

app.use((req, res, next) => {
  const blocked = req.path.startsWith("/src")
    || req.path.startsWith("/sql")
    || req.path.startsWith("/scripts")
    || req.path.startsWith("/node_modules")
    || req.path.includes(".env");
  if (blocked) return res.status(404).end();
  next();
});

app.use(express.static(root, { dotfiles: "ignore", index: "index.html" }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error del servidor." });
});

module.exports = app;
