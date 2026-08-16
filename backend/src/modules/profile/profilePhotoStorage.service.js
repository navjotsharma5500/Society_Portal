const AppError = require("../../common/errors/AppError");
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 1024 * 1024;

const store = async (file) => {
  if (!file) throw new AppError("Select a profile photo.", 400, "PROFILE_PHOTO_REQUIRED");
  if (!ALLOWED_TYPES.has(file.mimetype)) throw new AppError("Profile photo must be JPEG, PNG, or WebP.", 400, "INVALID_PROFILE_PHOTO_TYPE");
  if (file.size > MAX_BYTES) throw new AppError("Profile photo must be 1 MB or smaller.", 413, "PROFILE_PHOTO_TOO_LARGE");
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
};
module.exports = { store, MAX_BYTES, ALLOWED_TYPES };
