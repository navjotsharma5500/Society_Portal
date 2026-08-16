const AppError = require("../../common/errors/AppError"),
  { PAGINATION } = require("./societyClaimVerification.constants");
const decision =
  (reasonRequired = false) =>
  (req, res, next) => {
    try {
      const reason =
          typeof req.body?.reason === "string" ? req.body.reason.trim() : "",
        remarks =
          typeof req.body?.remarks === "string"
            ? req.body.remarks.trim()
            : undefined;
      if (reasonRequired && !reason)
        throw new AppError(
          "Rejection reason is required",
          400,
          "REJECTION_REASON_REQUIRED"
        );
      if (reason.length > 3000 || remarks?.length > 3000)
        throw new AppError(
          "Reason or remarks is too long",
          400,
          "VALIDATION_ERROR"
        );
      req.body = { reason: reason || undefined, remarks };
      next();
    } catch (e) {
      next(e);
    }
  };
const queue = (req, res, next) => {
  try {
    const page = Number(req.query.page || PAGINATION.DEFAULT_PAGE),
      limit = Number(req.query.limit || PAGINATION.DEFAULT_LIMIT);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > PAGINATION.MAX_LIMIT
    )
      throw new AppError("Invalid pagination", 400, "VALIDATION_ERROR");
    req.pagination = { page, limit, filters:{societyId:req.query.societyId,status:req.query.status,roleId:req.query.roleId,academicSession:req.query.academicSession,submittedFrom:req.query.submittedFrom,submittedTo:req.query.submittedTo} };
    next();
  } catch (e) {
    next(e);
  }
};
module.exports = {
  validateApprove: decision(false),
  validateReject: decision(true),
  validateRequestChanges: decision(true),
  validateQueue: queue,
};
