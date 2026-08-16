const express = require("express");
const controller = require("./societyImport.controller");
const validation = require("./societyImport.validation");
const { authenticateSession } = require("../auth/auth.middleware");
const { requirePermission } = require("../authorization/authorization.middleware");

const router = express.Router();
router.use(authenticateSession);

router.get("/template", requirePermission("society.template.download"), controller.downloadTemplate);
router.post("/preview", requirePermission("society.import.preview"), validation.uploadExcel, validation.validatePreview, controller.preview);
router.get("/:importSessionId", requirePermission("society.import.preview"), validation.validateSessionId, controller.getSession);
router.post("/:importSessionId/confirm", requirePermission("society.import.confirm"), validation.validateSessionId, controller.confirm);

module.exports = router;
