const path = require("path"), multer = require("multer"), mongoose = require("mongoose"), AppError = require("../../common/errors/AppError");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, done) => { const valid = path.extname(file.originalname).toLowerCase() === ".xlsx"; done(valid ? null : new AppError("A valid XLSX file is required", 400, "INVALID_EXCEL_FILE"), valid); } }).single("file");
const uploadExcel = (req, res, next) => upload(req, res, (error) => error ? next(error.isOperational ? error : new AppError("Unable to upload XLSX file", 400, "INVALID_EXCEL_FILE")) : req.file ? next() : next(new AppError("Excel file is required", 400, "INVALID_EXCEL_FILE")));
const sessionId = (req, res, next) => mongoose.Types.ObjectId.isValid(req.params.importSessionId) ? next() : next(new AppError("Budget import session not found", 404, "IMPORT_SESSION_NOT_FOUND"));
module.exports = { uploadExcel, sessionId };
