const express = require("express");
const auth = require("../controllers/auth.controller");
const { requireRole } = require("../middlewares/role.middleware");

const router = express.Router();

router.post("/register", auth.register);
router.post("/login", auth.login);
router.post("/logout", auth.logout);
router.get("/me", auth.me);
router.get("/users", requireRole("admin"), auth.listUsers);
router.post("/users", requireRole("admin"), auth.createUser);
router.patch("/users/:id", requireRole("admin"), auth.updateUser);
router.delete("/users/:id", requireRole("admin"), auth.deleteUser);
router.get("/login-attempts", requireRole("admin"), auth.listLoginFailures);
router.get("/login-failures", requireRole("admin"), auth.listLoginFailures);

module.exports = router;
