const router = require("express").Router(),
  c = require("./event.controller"),
  v = require("./event.validation"),
  { authenticateSession } = require("../auth/auth.middleware"),
  { requirePermission } = require("../authorization/authorization.middleware");
router.use(authenticateSession);
router.get("/", requirePermission("event.view"), v.page, c.all);
router.get("/reviews/assigned-to-me", c.reviews);
router.get("/reviews/assigned-counts", c.reviewCounts);
// Self-scoped: always computed from the authenticated caller's own userId (never a request-supplied
// one), so a route-level society-scoped permission gate is both unnecessary and incorrectly denies
// a Society-scoped General Secretary (their "event.view" grant never matches the GLOBAL-only scope
// requirePermission() checks here without a :societyId param). authenticateSession is sufficient.
router.get("/live-request-usage", c.liveRequestUsage);
router.get("/reviews/event/:eventId", c.reviewDetail);
router.post("/reviews/:reviewId/decision", c.decide);
router.post("/reviews/:reviewId/amend", c.amend);
router.put("/reviews/:reviewId/budget", c.saveBudgetReview);
router.get("/society/:societyId", v.page, c.society);
router.post("/", v.clean, c.create);
// Must be registered before "/:eventId" — otherwise Express would treat "proposal-context" as an
// :eventId route param and this would never be reached. Authorization is Society-scoped
// (event.create via accessContext in the service), not a GLOBAL requirePermission gate here.
router.get("/proposal-context", c.proposalContext);
router.get("/:eventId", c.get);
router.patch("/:eventId", v.clean, c.update);
router.post("/:eventId/submit", c.submit);
router.post("/:eventId/cancel", c.cancel);
module.exports = router;
