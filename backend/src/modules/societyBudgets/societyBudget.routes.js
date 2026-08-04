const express = require("express");
const controller = require("./societyBudget.controller");
const validation = require("./societyBudget.validation");
const router = express.Router();

router.route("/").post(validation.validateCreate, controller.create).get(validation.validateList, controller.list);
router.get("/summary", validation.validateSummary, controller.summary);
router.get("/society/:societyId/current", validation.validateCurrent, controller.current);
router.post("/:budgetId/adjust", validation.validateAdjustment, controller.adjust);
router.post("/:budgetId/manual-adjustment", validation.validateManual, controller.manualAdjustment);
router.patch("/:budgetId/close", validation.validateClose, controller.close);
router.get("/:budgetId/transactions", validation.validateTransactions, controller.transactions);
router.get("/:budgetId", controller.getOne);

module.exports = router;
