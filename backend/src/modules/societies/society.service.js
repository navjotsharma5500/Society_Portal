const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const repository = require("./society.repository");
const { SOCIETY_STATUSES } = require("./society.constants");
const { prepareSocietyCode } = require("./societyCode.service");
const invalidate=require("../../cache/cacheInvalidation");
const events=require("../../common/events/domainEvent.service");
const emit=(eventType,society)=>events.publish(eventType,{metadata:{societyId:String(society._id),societyCode:society.code}});

const assertValidId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id) || !/^[a-f\d]{24}$/i.test(id)) {
    throw new AppError("Invalid society ID", 400, "INVALID_SOCIETY_ID");
  }
};

const throwCodeExists = () => {
  throw new AppError(
    "A society with this code already exists",
    409,
    "SOCIETY_CODE_EXISTS"
  );
};

const handleDuplicateCode = (error) => {
  if (error && error.code === 11000) throwCodeExists();
  throw error;
};

const synchronizeStatus = (data) => {
  const synchronized = { ...data };

  if (synchronized.status) {
    synchronized.isActive = synchronized.status === SOCIETY_STATUSES.ACTIVE;
  } else if (typeof synchronized.isActive === "boolean") {
    synchronized.status = synchronized.isActive
      ? SOCIETY_STATUSES.ACTIVE
      : SOCIETY_STATUSES.INACTIVE;
  }

  return synchronized;
};

const createSociety = async (data, options = {}) => {
  const prepared = await prepareSocietyCode({
    suppliedCode: data.code,
    name: data.name,
    campus: data.metadata?.campus,
    isCodeTaken: async (code) => Boolean(await repository.findByCode(code)),
  });
  if (!prepared.code) throw new AppError("Unable to generate a unique society code", 409, "SOCIETY_CODE_GENERATION_FAILED");
  if (!prepared.regenerated && await repository.findByCode(prepared.code)) throwCodeExists();

  try {
    const item=await repository.create(synchronizeStatus({ ...data, code: prepared.code }));if(!options.skipCacheInvalidation)await invalidate.societies();emit("SOCIETY_CREATED",item);return item;
  } catch (error) {
    return handleDuplicateCode(error);
  }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const listSocieties = async (filters, req) => {
  const query = {};

  if (filters.search) {
    const search = new RegExp(escapeRegex(filters.search), "i");
    query.$or = [{ name: search }, { code: search }, { shortName: search }];
  }
  if (filters.status) query.status = filters.status;
  if (filters.category) query.category = filters.category;
  if (typeof filters.isActive === "boolean") query.isActive = filters.isActive;

  const { items, totalItems } = await repository.findAll(
    query,
    filters.page,
    filters.limit,
    req
  );

  return {
    items,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / filters.limit),
    },
  };
};

const getSociety = async (id) => {
  assertValidId(id);
  const society = await repository.findById(id);

  if (!society) {
    throw new AppError("Society not found", 404, "SOCIETY_NOT_FOUND");
  }

  return society;
};

const updateSociety = async (id, data) => {
  assertValidId(id);

  if (data.code) {
    const societyWithCode = await repository.findByCode(data.code);
    if (societyWithCode && String(societyWithCode._id) !== String(id)) throwCodeExists();
  }

  try {
    const society = await repository.updateById(id, synchronizeStatus(data));
    if (!society) {
      throw new AppError("Society not found", 404, "SOCIETY_NOT_FOUND");
    }
    await invalidate.societies();emit("SOCIETY_UPDATED",society);return society;
  } catch (error) {
    return handleDuplicateCode(error);
  }
};

const updateSocietyStatus = async (id, status) => {
  assertValidId(id);
  const society = await repository.updateStatus(
    id,
    status,
    status === SOCIETY_STATUSES.ACTIVE
  );

  if (!society) {
    throw new AppError("Society not found", 404, "SOCIETY_NOT_FOUND");
  }

  await invalidate.societies();emit("SOCIETY_STATUS_CHANGED",society);return society;
};

module.exports = {
  createSociety,
  listSocieties,
  getSociety,
  updateSociety,
  updateSocietyStatus,
};
