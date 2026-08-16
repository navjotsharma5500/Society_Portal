const r = require("express").Router(),
  c = require("./membershipRequest.controller"),
  v = require("./membershipRequest.validation"),
  { authenticateSession } = require("../auth/auth.middleware");
r.use(authenticateSession);
r.post("/", v.create, c.create);
r.get("/me", v.page, c.me);
r.get("/assigned-to-me", v.page, c.assigned);
r.get("/assigned-counts", c.counts);
r.get("/:requestId", c.get);
r.patch("/:requestId/cancel", c.cancel);
r.post("/:requestId/approve", v.approve, c.approve);
r.post("/:requestId/reject", v.reject, c.reject);
r.post("/:requestId/request-clarification", v.reject, c.clarify);
r.post("/:requestId/resubmit", v.resubmit, c.resubmit);
module.exports = r;
