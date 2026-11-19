const express = require("express");
const catalog = require("../controllers/catalog.controller");
const invoices = require("../controllers/invoices.controller");
const { requireAuth, requireRole } = require("../middlewares/role.middleware");

const router = express.Router();
const staff = requireRole("vendedor", "admin");

router.get("/products", catalog.listProducts);
router.post("/products", staff, catalog.createProduct);
router.patch("/products/:id", staff, catalog.updateProduct);
router.delete("/products/:id", staff, catalog.removeProduct);
router.post("/products/:id/consume", requireAuth, catalog.consumeStock);

router.post("/invoices", requireRole("comprador"), invoices.createInvoice);
router.get("/invoices", requireRole("admin"), invoices.listInvoices);

module.exports = router;
