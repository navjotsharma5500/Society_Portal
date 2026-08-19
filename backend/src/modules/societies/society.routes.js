const express = require("express");
const timedRequire = (label, path) => {
  const started = process.hrtime.bigint();
  const result = require(path);
  if (process.env.NODE_ENV === "development") {
    const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    if (ms >= 50) console.info(`[startup] require society.routes -> ${label}: ${ms}ms`);
  }
  return result;
};
const controller = timedRequire("society.controller", "./society.controller");
const validation = timedRequire("society.validation", "./society.validation");
const { authenticateSession } = timedRequire("auth.middleware", "../auth/auth.middleware");
const { requirePermission } = timedRequire("authorization.middleware", "../authorization/authorization.middleware");
const multer = timedRequire("multer", "multer"),
  upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const router = express.Router();
router.use(authenticateSession);

router
  .route("/")
  .post(requirePermission("society.create"), validation.validateCreate, controller.createSociety)
  .get(requirePermission("society.view"), validation.validateList, controller.listSocieties);

router.patch(
  "/:id/status",
  requirePermission("society.status.change"), validation.validateStatusUpdate,
  controller.updateSocietyStatus
);
router.get("/:id/team", requirePermission("society.view",{societyIdKey:"id"}), controller.getCurrentTeam);
router.get("/:id/team/roles",requirePermission("leadership.view",{societyIdKey:"id"}),controller.teamRoles);
router.get("/:id/team/people",requirePermission("leadership.create",{societyIdKey:"id"}),controller.searchTeamPeople);
router.post("/:id/team/assign",requirePermission("leadership.create",{societyIdKey:"id"}),controller.assignTeamRole);
router.patch("/:id/team/assignments/:assignmentId/end",requirePermission("leadership.end",{societyIdKey:"id"}),controller.endTeamTenure);
router.get("/:id/team/import/template",requirePermission("leadership.create",{societyIdKey:"id"}),controller.teamTemplate);
router.post("/:id/team/import/preview",requirePermission("leadership.create",{societyIdKey:"id"}),upload.single("file"),controller.previewTeamImport);
router.post("/:id/team/import/:sessionId/confirm",requirePermission("leadership.create",{societyIdKey:"id"}),controller.confirmTeamImport);
router.post("/:id/team/resync",requirePermission("society.edit",{societyIdKey:"id"}),controller.resyncTeam);
router
  .route("/:id")
  .get(requirePermission("society.view"), controller.getSociety)
  .patch(requirePermission("society.edit"), validation.validateUpdate, controller.updateSociety);

module.exports = router;
