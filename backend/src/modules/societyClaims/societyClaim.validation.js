const AppError = require("../../common/errors/AppError");
const fields = [
  "societyId",
  "claimedRoleId",
  "startDate",
  "endDate",
  "isOngoing",
  "events",
  "studentDescription",
];
const clean = (body, required) => {
  const data = Object.fromEntries(
    fields.filter((k) => body?.[k] !== undefined).map((k) => [k, body[k]])
  );
  if (required)
    for (const k of ["societyId", "claimedRoleId", "startDate", "isOngoing"])
      if (data[k] === undefined || data[k] === null || data[k] === "")
        throw new AppError(`${k} is required`, 400, "VALIDATION_ERROR");
  if (
    data.studentDescription !== undefined &&
    (typeof data.studentDescription !== "string" ||
      data.studentDescription.length > 3000)
  )
    throw new AppError(
      "studentDescription cannot exceed 3000 characters",
      400,
      "VALIDATION_ERROR"
    );
  if (data.isOngoing !== undefined && typeof data.isOngoing !== "boolean")
    throw new AppError("isOngoing must be boolean", 400, "VALIDATION_ERROR");
  if (data.events !== undefined && !Array.isArray(data.events))
    throw new AppError("events must be an array", 400, "VALIDATION_ERROR");
  for (const e of data.events || [])
    if (!e.eventName || !e.startDate)
      throw new AppError(
        "Each event requires eventName and startDate",
        400,
        "VALIDATION_ERROR"
      );
  return data;
};
const body = (required) => (req, res, next) => {
  try {
    req.body = clean(req.body, required);
    if (!required && !Object.keys(req.body).length)
      throw new AppError(
        "At least one claim field is required",
        400,
        "VALIDATION_ERROR"
      );
    next();
  } catch (e) {
    next(e);
  }
};
module.exports = { validateCreate: body(true), validateUpdate: body(false) };
