const router = require("express").Router();
const { authenticateSession } = require("../auth/auth.middleware");
const { requirePermission } = require("../authorization/authorization.middleware");
const service = require("./adminDashboard.service");
router.get("/summary", authenticateSession, requirePermission("dashboard.super_admin.view"), async (req, res) => res.json({ success: true, data: await service.summary(req) }));
module.exports = router;
