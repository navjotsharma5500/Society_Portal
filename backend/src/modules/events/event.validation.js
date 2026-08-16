const AppError = require("../../common/errors/AppError");
const clean = (req, res, next) => {
  try {
    if (
      req.body.societyId !== undefined &&
      typeof req.body.societyId !== "string"
    )
      throw new AppError("Invalid society", 400, "VALIDATION_ERROR");
    if (req.body.title?.length > 200)
      throw new AppError("Event title is too long", 400, "VALIDATION_ERROR");
    next();
  } catch (e) {
    next(e);
  }
};
const page = (req, res, next) => {
  try {
    const p = Number(req.query.page || 1),
      l = Number(req.query.limit || 20);
    if (
      !Number.isInteger(p) ||
      p < 1 ||
      !Number.isInteger(l) ||
      l < 1 ||
      l > 100
    )
      throw new AppError("Invalid pagination", 400, "VALIDATION_ERROR");
    next();
  } catch (e) {
    next(e);
  }
};
module.exports = { clean, page };
