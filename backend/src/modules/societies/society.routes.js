const express = require("express");
const controller = require("./society.controller");
const validation = require("./society.validation");

const router = express.Router();

router
  .route("/")
  .post(validation.validateCreate, controller.createSociety)
  .get(validation.validateList, controller.listSocieties);

router.patch(
  "/:id/status",
  validation.validateStatusUpdate,
  controller.updateSocietyStatus
);
router
  .route("/:id")
  .get(controller.getSociety)
  .patch(validation.validateUpdate, controller.updateSociety);

module.exports = router;
