function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "No hay sesión." });
  }
  next();
}

function requireRole(...roles) {
  return function checkRole(req, res, next) {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: "No hay sesión." });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: "Rol no permitido." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
