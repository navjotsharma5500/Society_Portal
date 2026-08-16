const express = require("express"),
  c = require("./permission.controller"),
  v = require("./permission.validation");
const router = express.Router();
const { authenticateSession } = require("../auth/auth.middleware");
const { requirePermission } = require("../authorization/authorization.middleware");
const sync = require("./permissionSync.service");
router.use(authenticateSession);
router.get("/sync/preview", requirePermission("permission.sync"), async (req, res) => res.json({ success: true, data: await sync.preview() }));
router.post("/sync/confirm", requirePermission("permission.sync"), async (req, res) => res.json({ success: true, data: await sync.syncMissing(req.auth.userId) }));
router.get("/catalog/grouped", requirePermission("permission.view"), c.grouped);
router.route("/").post(requirePermission("permission.create"), v.validateCreate, c.create).get(requirePermission("permission.view"), v.validateList, c.list);
router.patch("/:permissionId/status", requirePermission("permission.status.change"), v.validateStatus, c.status);
router.route("/:permissionId").get(requirePermission("permission.view"), c.get).patch(requirePermission("permission.edit"), v.validateUpdate, c.update);
module.exports = router;
