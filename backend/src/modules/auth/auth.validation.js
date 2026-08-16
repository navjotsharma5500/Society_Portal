const AppError = require("../../common/errors/AppError");
const google = (req, res, next) => {
  try {
    if (typeof req.body?.idToken !== "string" || !req.body.idToken.trim())
      throw new AppError("idToken is required", 400, "VALIDATION_ERROR");
    req.body = {
      idToken: req.body.idToken.trim(),
      deviceId:
        typeof req.body.deviceId === "string"
          ? req.body.deviceId.trim()
          : undefined,
      deviceName:
        typeof req.body.deviceName === "string"
          ? req.body.deviceName.trim()
          : undefined,
    };
    next();
  } catch (e) {
    next(e);
  }
};
module.exports = { validateGoogle: google };
