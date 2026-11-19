const express = require("express");
const invoices = require("../controllers/invoices.controller");
const { requireAuth, requireRole } = require("../middlewares/role.middleware");

const router = express.Router();

router.post("/invoices", requireRole("comprador"), invoices.createInvoice);
router.get("/invoices", requireAuth, invoices.listInvoices);

module.exports = router;
