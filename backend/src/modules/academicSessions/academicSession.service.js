const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const AcademicSession = require("./academicSession.model");
const cache = require("../../cache/cacheService"),
  keys = require("../../cache/cacheKeys"),
  ttl = require("../../cache/cacheTtls"),
  invalidate = require("../../cache/cacheInvalidation");

const validateId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new AppError(
      "Academic session not found",
      404,
      "ACADEMIC_SESSION_NOT_FOUND"
    );
};
const normalize = (data, actorId) => ({
  name: data.name?.trim(),
  startDate: data.startDate,
  endDate: data.endDate,
  description: data.description?.trim() || undefined,
  semesters: data.semesters || [],
  updatedBy: actorId,
});
const getSessionById = async (id) => {
  validateId(id);
  const item = await AcademicSession.findById(id).lean();
  if (!item)
    throw new AppError(
      "Academic session not found",
      404,
      "ACADEMIC_SESSION_NOT_FOUND"
    );
  return item;
};
const getCurrentAcademicSession = async ({ required = false } = {}) => {
  const item = await cache.getOrLoad(
    keys.currentSession,
    ttl.currentSession,
    () => AcademicSession.findOne({ isCurrent: true }).lean()
  );
  if (!item && required)
    throw new AppError(
      "No current academic session has been configured",
      409,
      "CURRENT_ACADEMIC_SESSION_NOT_CONFIGURED"
    );
  return item;
};
const listSessions = () =>
  AcademicSession.find().sort({ startDate: -1 }).lean();
const resolveSession = async (value, options) => {
  if (!value) return getCurrentAcademicSession(options);
  return mongoose.Types.ObjectId.isValid(value)
    ? getSessionById(value)
    : AcademicSession.findOne({ name: value }).lean();
};
const create = async (data, actorId) => {
  try {
    const item = await AcademicSession.create({
      ...normalize(data, actorId),
      createdBy: actorId,
    });
    await invalidate.sessions();
    return item;
  } catch (error) {
    if (error.code === 11000)
      throw new AppError(
        "Session name already exists",
        409,
        "ACADEMIC_SESSION_EXISTS"
      );
    throw error;
  }
};
const update = async (id, data, actorId) => {
  validateId(id);
  const current = await AcademicSession.findById(id);
  if (!current)
    throw new AppError(
      "Academic session not found",
      404,
      "ACADEMIC_SESSION_NOT_FOUND"
    );
  Object.assign(current, normalize(data, actorId));
  const item = await current.save();
  await invalidate.sessions();
  return item;
};
const setCurrentBase = async (id, actorId) => {
  validateId(id);
  const target = await AcademicSession.findById(id);
  if (!target)
    throw new AppError(
      "Academic session not found",
      404,
      "ACADEMIC_SESSION_NOT_FOUND"
    );
  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      await AcademicSession.updateMany(
        { isCurrent: true, _id: { $ne: target._id } },
        { $set: { isCurrent: false, updatedBy: actorId } },
        { session: mongoSession }
      );
      result = await AcademicSession.findByIdAndUpdate(
        target._id,
        { $set: { isCurrent: true, status: "ACTIVE", updatedBy: actorId } },
        { returnDocument: "after", session: mongoSession }
      );
    });
    return result;
  } catch (error) {
    if (error.code === 20 || /Transaction/.test(error.message || "")) {
      await AcademicSession.updateMany(
        { isCurrent: true },
        { $set: { isCurrent: false, updatedBy: actorId } }
      );
      return AcademicSession.findByIdAndUpdate(
        target._id,
        { $set: { isCurrent: true, status: "ACTIVE", updatedBy: actorId } },
        { returnDocument: "after" }
      );
    }
    throw error;
  } finally {
    await mongoSession.endSession();
  }
};
const setCurrent = async (id, actorId) => {
  const item = await setCurrentBase(id, actorId);
  await invalidate.sessions();
  return item;
};
module.exports = {
  getCurrentAcademicSession,
  getSessionById,
  listSessions,
  resolveSession,
  create,
  update,
  setCurrent,
};
