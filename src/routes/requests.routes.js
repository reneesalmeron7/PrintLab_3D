const express = require("express");
const { requireAuth, requireRole } = require("../middlewares/role.middleware");
const {
  listRequests,
  createRequest,
  updateRequest,
  respondToRequest,
  downloadRequestFile
} = require("../controllers/requests.controller");

const router = express.Router();

router.get("/requests", requireAuth, listRequests);
router.post("/requests", requireAuth, createRequest);
router.post("/requests/:id/respond", requireAuth, respondToRequest);
router.patch("/requests/:id", requireRole("vendedor", "admin"), updateRequest);
router.get("/requests/:id/file", requireAuth, downloadRequestFile);

module.exports = router;
