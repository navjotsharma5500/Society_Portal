const router = require("express").Router(),
  c = require("./event.controller"),
  v = require("./event.validation"),
  { authenticateSession } = require("../auth/auth.middleware"),
  { requirePermission } = require("../authorization/authorization.middleware");
router.use(authenticateSession);
router.get("/", requirePermission("event.view"), v.page, c.all);
router.get("/reviews/assigned-to-me", c.reviews);
router.get("/reviews/assigned-counts", c.reviewCounts);
router.get("/live-request-usage", requirePermission("event.view"), c.liveRequestUsage);
router.get("/reviews/event/:eventId", c.reviewDetail);
router.post("/reviews/:reviewId/decision", c.decide);
router.post("/reviews/:reviewId/amend", c.amend);
router.put("/reviews/:reviewId/budget", c.saveBudgetReview);
router.get("/society/:societyId", v.page, c.society);
router.post("/", v.clean, c.create);
router.get("/:eventId", c.get);
router.patch("/:eventId", v.clean, c.update);
router.post("/:eventId/submit", c.submit);
module.exports = router;
