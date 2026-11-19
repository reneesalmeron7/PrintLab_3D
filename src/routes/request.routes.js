const express = require("express");
const requests = require("../controllers/request.controller");
const { requireAuth, requireRole } = require("../middlewares/role.middleware");

const router = express.Router();
const staff = requireRole("vendedor", "admin");

router.get("/requests", staff, requests.listRequests);
router.post("/requests", requireAuth, requests.createRequest);
router.patch("/requests/:id", staff, requests.updateRequestStatus);

module.exports = router;
