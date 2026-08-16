const express = require("express"),
  c = require("./portalSetting.controller"),
  v = require("./portalSetting.validation"),
  { authenticateSession } = require("../auth/auth.middleware"),
  { requirePermission } = require("../authorization/authorization.middleware");
const router = express.Router();
router.get("/public", c.publicSettings);
router.get(
  "/",
  authenticateSession,
  requirePermission("settings.view"),
  c.all
);
router.patch(
  "/:key",
  authenticateSession,
  requirePermission("settings.manage_general"),
  v.validateUpdate,
  c.update
);
module.exports = router;
