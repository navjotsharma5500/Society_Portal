const express = require("express"),
  c = require("./societyClaim.controller"),
  v = require("./societyClaim.validation");
const router = express.Router({ mergeParams: true });
router.post("/", v.validateCreate, c.create);
router.get("/:claimId", c.get);
router.post("/:claimId/resubmit", c.resubmit);
router.route("/:claimId").patch(v.validateUpdate, c.update).delete(c.remove);
module.exports = router;
