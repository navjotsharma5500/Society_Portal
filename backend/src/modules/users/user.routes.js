const express = require("express"),
  controller = require("./user.controller"),
  validation = require("./user.validation");
const router = express.Router();
const { authenticateSession } = require("../auth/auth.middleware");
const { requirePermission } = require("../authorization/authorization.middleware");
const multer=require("multer"),upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
router.use(authenticateSession);
router.get("/import/template",requirePermission("user.create"),controller.importTemplate);
router.post("/import/preview",requirePermission("user.create"),upload.single("file"),controller.previewImport);
router.post("/import/:importSessionId/confirm",requirePermission("user.create"),controller.confirmImport);
router
  .route("/")
  .post(requirePermission("user.create"), validation.validateCreate, controller.create)
  .get(requirePermission("user.view"), validation.validateList, controller.list);
router.get("/:userId/effective-permissions", requirePermission("user.view"), controller.effectivePermissions);
router.patch("/:userId/status", requirePermission("user.status.change"), validation.validateStatus, controller.status);
router.patch(
  "/:userId/login-access",
  requirePermission("user.login_access.change"), validation.validateLogin,
  controller.login
);
router.route("/:userId").get(requirePermission("user.view"), controller.get).patch(requirePermission("user.edit"), validation.validateUpdate,controller.update);
module.exports = router;
