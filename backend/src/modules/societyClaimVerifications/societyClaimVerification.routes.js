const express = require("express"),
  c = require("./societyClaimVerification.controller"),
  v = require("./societyClaimVerification.validation"),
  { authenticateSession } = require("../auth/auth.middleware");
const router = express.Router();
router.use(authenticateSession);
router.get("/assigned-to-me", v.validateQueue, c.queue);
router.get("/assigned-counts", c.counts);
router.get("/claims/:claimId", c.get);
router.post("/claims/:claimId/approve", v.validateApprove, c.approve);
router.post("/claims/:claimId/reject", v.validateReject, c.reject);
router.post(
  "/claims/:claimId/request-changes",
  v.validateRequestChanges,
  c.requestChanges
);
module.exports = router;
