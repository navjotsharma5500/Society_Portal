const express = require("express"),
  controller = require("./auth.controller"),
  validation = require("./auth.validation"),
  { authenticateSession } = require("./auth.middleware");
const router = express.Router();
router.post("/google/sign-up", validation.validateGoogle, controller.signUp);
router.post("/google/sign-in", validation.validateGoogle, controller.signIn);
router.post("/google/staff-sign-in", validation.validateGoogle, controller.staffSignIn);
router.post("/refresh", controller.refresh);
router.post("/logout", authenticateSession, controller.logout);
router.post("/logout-all", authenticateSession, controller.logoutAll);
router.get("/me", authenticateSession, controller.me);
router.get("/sessions", authenticateSession, controller.list);
router.delete("/sessions/:sessionId", authenticateSession, controller.remove);
router.get("/context/:societyId", authenticateSession, controller.context);
module.exports = router;
