const express = require("express"),
  c = require("./studentOnboarding.controller"),
  v = require("./studentOnboarding.validation"),
  AppError = require("../../common/errors/AppError"),
  claimRoutes = require("../societyClaims/societyClaim.routes"),
  { authenticateSession } = require("../auth/auth.middleware");
const router = express.Router();
router.use(authenticateSession);
router.get("/me", c.get);
router.post("/start", c.start);
router.patch("/me", v.validateUpdate, c.update);
router.post("/me/submit", c.submit);
router.get("/me/progress", c.progress);
router.get("/references", (req, res, next) =>
  req.auth.accountType === "STUDENT"
    ? c.references(req, res, next)
    : next(new AppError("Student account required", 403, "STUDENT_ACCOUNT_REQUIRED"))
);
router.post("/me/accept-current-result", c.accept);
router.use("/me/claims", claimRoutes);
module.exports = router;
