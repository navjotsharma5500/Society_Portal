const AppError = require("../../common/errors/AppError");
const update = (req, res, next) => {
  try {
    if (req.body?.value === undefined)
      throw new AppError("value is required", 400, "VALIDATION_ERROR");
    req.body = { value: req.body.value };
    next();
  } catch (e) {
    next(e);
  }
};
module.exports = { validateUpdate: update };
