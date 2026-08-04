const express = require("express");
const controller = require("./societyImport.controller");
const validation = require("./societyImport.validation");

const router = express.Router();

router.get("/template", controller.downloadTemplate);
router.post("/preview", validation.uploadExcel, validation.validatePreview, controller.preview);
router.get("/:importSessionId", validation.validateSessionId, controller.getSession);
router.post("/:importSessionId/confirm", validation.validateSessionId, controller.confirm);

module.exports = router;
