const AppError = require("../../common/errors/AppError"),
  mongoose = require("mongoose");
const wrap = (fn) => (req, res, next) => {
  try {
    fn(req);
    next();
  } catch (e) {
    next(e);
  }
};
const id = (v) => mongoose.Types.ObjectId.isValid(v);
const page = wrap((req) => {
  req.pagination = {
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  };
  if (
    !Number.isInteger(req.pagination.page) ||
    req.pagination.page < 1 ||
    !Number.isInteger(req.pagination.limit) ||
    req.pagination.limit < 1 ||
    req.pagination.limit > 100
  )
    throw new AppError("Invalid pagination", 400, "VALIDATION_ERROR");
});
module.exports = {
  page,
  create: wrap((req) => {
    if (!id(req.body.societyId))
      throw new AppError("Invalid society", 400, "VALIDATION_ERROR");
    for (const k of ["requestReason", "studentMessage"])
      if (req.body[k]?.length > 2000)
        throw new AppError("Text is too long", 400, "VALIDATION_ERROR");
  }),
  approve: wrap((req) => {
    if (req.body.approvedRoleId && !id(req.body.approvedRoleId))
      throw new AppError("Invalid role", 400, "VALIDATION_ERROR");
  }),
  reject: wrap((req) => {
    if (!String(req.body.reason || "").trim())
      throw new AppError(
        "Rejection reason required",
        400,
        "MEMBERSHIP_REQUEST_REJECTION_REASON_REQUIRED"
      );
  }),
  resubmit: wrap((req) => {
    if (!String(req.body.requestReason || "").trim())
      throw new AppError("Request reason is required", 400, "VALIDATION_ERROR");
  }),
};
