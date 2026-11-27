const express = require("express");
const catalog = require("../controllers/catalog.controller");
const { requireAuth, requireRole } = require("../middlewares/role.middleware");

const router = express.Router();
const staff = requireRole("vendedor", "admin");

router.get("/categories", catalog.listCategories);
router.post("/categories", staff, catalog.createCategory);
router.get("/products", catalog.listProducts);
router.post("/products", staff, catalog.createProduct);
router.patch("/products/:id", staff, catalog.updateProduct);
router.delete("/products/:id", staff, catalog.removeProduct);
router.post("/products/:id/consume", requireAuth, catalog.consumeStock);

module.exports = router;
