const express = require("express");
const controller = require("./societyLeadership.controller");
const validation = require("./societyLeadership.validation");

const router = express.Router();
router.route("/").post(validation.validateCreate, controller.createLeadershipAssignment).get(validation.validateList, controller.listLeadershipAssignments);
router.get("/society/:societyId/active", validation.validateActive, controller.getActiveSocietyApprovers);
router.patch("/:id/end", validation.validateEnd, controller.endLeadershipAssignment);
router.patch("/:id/status", validation.validateStatus, controller.updateLeadershipStatus);
router.route("/:id").get(controller.getLeadershipAssignment).patch(validation.validateUpdate, controller.updateLeadershipAssignment);

module.exports = router;
