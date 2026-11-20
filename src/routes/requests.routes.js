const express = require("express");
const { requireAuth, requireRole } = require("../middlewares/role.middleware");
const {
  listRequests,
  createRequest,
  updateRequest,
  downloadRequestFile
} = require("../controllers/requests.controller");

const router = express.Router();

router.get("/requests", requireAuth, listRequests);
router.post("/requests", requireAuth, createRequest);
router.patch("/requests/:id", requireRole("vendedor", "admin"), updateRequest);
router.get("/requests/:id/file", requireAuth, downloadRequestFile);

module.exports = router;
