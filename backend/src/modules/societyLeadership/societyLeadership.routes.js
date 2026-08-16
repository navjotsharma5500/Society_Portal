const express = require("express");
const controller = require("./societyLeadership.controller");
const validation = require("./societyLeadership.validation");
const { authenticateSession } = require("../auth/auth.middleware");
const { requirePermission } = require("../authorization/authorization.middleware");
const multer=require("multer"),upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});

const router = express.Router();
router.use(authenticateSession);
router.get("/import/template",requirePermission("leadership.create"),controller.importTemplate);
router.post("/import/preview",requirePermission("leadership.create"),upload.single("file"),controller.previewImport);
router.post("/import/:importSessionId/confirm",requirePermission("leadership.create"),controller.confirmImport);
router.route("/").post(requirePermission("leadership.create"), validation.validateCreate, controller.createLeadershipAssignment).get(requirePermission("leadership.view"), validation.validateList, controller.listLeadershipAssignments);
router.get("/society/:societyId/active", requirePermission("leadership.view", { societyIdFrom: "params" }), validation.validateActive, controller.getActiveSocietyApprovers);
router.patch("/:id/end", requirePermission("leadership.end"), validation.validateEnd, controller.endLeadershipAssignment);
router.patch("/:id/status", requirePermission("leadership.status.change"), validation.validateStatus, controller.updateLeadershipStatus);
router.route("/:id").get(requirePermission("leadership.view"), controller.getLeadershipAssignment).patch(requirePermission("leadership.edit"), validation.validateUpdate, controller.updateLeadershipAssignment);

module.exports = router;
