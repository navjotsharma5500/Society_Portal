const path = require("path");
const multer = require("multer");
const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");

const XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const valid = path.extname(file.originalname).toLowerCase() === ".xlsx" && XLSX_MIME_TYPES.has(file.mimetype);
    callback(valid ? null : new AppError("A valid XLSX file is required", 400, "INVALID_EXCEL_FILE"), valid);
  },
}).single("file");

const uploadExcel = (req, res, next) => {
  uploader(req, res, (error) => {
    if (error) {
      if (error.isOperational) return next(error);
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Excel file must not exceed 5 MB"
        : "A valid XLSX file is required";
      return next(new AppError(message, 400, "INVALID_EXCEL_FILE"));
    }
    if (!req.file) return next(new AppError("Excel file is required", 400, "INVALID_EXCEL_FILE"));
    next();
  });
};

const validatePreview = (req, res, next) => {
  const session = typeof req.body.academicSession === "string" ? req.body.academicSession.trim() : "";
  if (!session) return next(new AppError("academicSession is required", 400, "VALIDATION_ERROR"));
  req.body.academicSession = session;
  next();
};

const validateSessionId = (req, res, next) => {
  const { importSessionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(importSessionId) || !/^[a-f\d]{24}$/i.test(importSessionId)) {
    return next(new AppError("Import session not found", 404, "IMPORT_SESSION_NOT_FOUND"));
  }
  next();
};

module.exports = { uploadExcel, validatePreview, validateSessionId };
