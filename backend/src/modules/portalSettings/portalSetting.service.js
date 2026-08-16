const AppError = require("../../common/errors/AppError"),
  Setting = require("./portalSetting.model");
const cache=require("../../cache/cacheService"),keys=require("../../cache/cacheKeys"),ttl=require("../../cache/cacheTtls"),invalidate=require("../../cache/cacheInvalidation");
const DEFAULTS = Object.freeze({
  "event.max_live_requests_per_general_secretary": { value: 3, isPublic: true, description: "Maximum live Event requests per General Secretary" },
  "membership.max_active_societies_per_student": {
    value: 3,
    isPublic: true,
    description: "Maximum active society memberships per student",
  },
  "membership.max_live_join_requests_per_student": {
    value: 3,
    isPublic: true,
    description: "Maximum pending or live society join requests per student",
  },
  "membership.restore_window_hours": { value: 24, isPublic: false, description: "Hours after ending in which a membership may be restored" },
  "membership.bulk_max_safe_count": { value: 5000, isPublic: false, description: "Maximum records in a previewed membership bulk operation" },
});
const ensureDefaults = async () => {
  for (const [key, data] of Object.entries(DEFAULTS))
    await Setting.updateOne(
      { key },
      { $setOnInsert: { key, ...data } },
      { upsert: true }
    );
};
const getValue = async (key) => {
  const values=await cache.getOrLoad(keys.settingsGeneral,ttl.settings,async()=>{await ensureDefaults();return Setting.find().select("key value").lean();});
  return values.find(item=>item.key===key)?.value;
};
const getPublic = async () => {
  await ensureDefaults();
  return Setting.find({ isPublic: true })
    .select("key value description")
    .lean();
};
const getAll = async () => {
  await ensureDefaults();
  return Setting.find().select("-metadata").sort({ key: 1 }).lean();
};
const update = async (key, value, actorId) => {
  if (!Object.hasOwn(DEFAULTS, key))
    throw new AppError(
      "Portal setting not found",
      404,
      "PORTAL_SETTING_NOT_FOUND"
    );
  if (
    (key.startsWith("membership.") || key.startsWith("event.")) &&
    (!Number.isInteger(value) || value < 1 || value > 100)
  )
    throw new AppError(
      "Setting value must be an integer between 1 and 100",
      400,
      "VALIDATION_ERROR"
    );
  const item=await Setting.findOneAndUpdate(
    { key },
    {
      $set: { value, updatedBy: actorId },
      $setOnInsert: {
        isPublic: DEFAULTS[key].isPublic,
        description: DEFAULTS[key].description,
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true }
  ).select("-metadata");await invalidate.settings();return item;
};
module.exports = {
  ensureDefaults,
  getValue,
  getPublic,
  getAll,
  update,
  DEFAULTS,
};
