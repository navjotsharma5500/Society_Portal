const AppError = require("../../common/errors/AppError");
const update = (req, res, next) => {
  try {
    const remarks = req.body?.metadata?.supportingRemarks;
    if (
      remarks !== undefined &&
      (typeof remarks !== "string" || remarks.length > 3000)
    )
      throw new AppError(
        "supportingRemarks cannot exceed 3000 characters",
        400,
        "VALIDATION_ERROR"
      );
    req.body = {
      metadata: {
        ...(remarks !== undefined ? { supportingRemarks: remarks.trim() } : {}),
      },
    };
    next();
  } catch (e) {
    next(e);
  }
};
module.exports = { validateUpdate: update };
