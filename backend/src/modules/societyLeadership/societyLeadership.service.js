const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Society = require("../societies/society.model");
const repository = require("./societyLeadership.repository");
const { LEADERSHIP_ROLES, LEADERSHIP_STATUSES } = require("./societyLeadership.constants");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(id);

const assertLeadershipId = (id) => {
  if (!isValidObjectId(id)) throw new AppError("Invalid leadership ID", 400, "INVALID_LEADERSHIP_ID");
};

const assertSocietyId = (id) => {
  if (!isValidObjectId(id)) throw new AppError("Invalid society ID", 400, "INVALID_SOCIETY_ID");
};

const getExistingSociety = async (societyId) => {
  assertSocietyId(societyId);
  const society = await Society.findById(societyId);
  if (!society) throw new AppError("Society not found", 404, "SOCIETY_NOT_FOUND");
  return society;
};

const assertSocietyAllowsActiveAssignment = (society, data) => {
  const willBeActive = data.status !== LEADERSHIP_STATUSES.INACTIVE && data.isOngoing !== false;
  if (willBeActive && (society.status !== "ACTIVE" || society.isActive !== true)) {
    throw new AppError("Inactive society cannot receive an active leadership assignment", 409, "SOCIETY_INACTIVE");
  }
};

const throwDuplicate = () => {
  throw new AppError("This active leadership assignment already exists", 409, "LEADERSHIP_ASSIGNMENT_EXISTS");
};

const handleDuplicate = (error) => {
  if (error?.code === 11000) throwDuplicate();
  throw error;
};

const duplicateFields = (data) => ({
  societyId: data.societyId,
  role: data.role,
  email: data.email,
  academicSession: data.academicSession,
});

const createLeadershipAssignment = async (data) => {
  const society = await getExistingSociety(data.societyId);
  assertSocietyAllowsActiveAssignment(society, data);
  if (await repository.findDuplicateAssignment(duplicateFields(data))) throwDuplicate();
  try {
    return await repository.create(data);
  } catch (error) {
    return handleDuplicate(error);
  }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const listLeadershipAssignments = async (filters) => {
  const query = {};
  for (const field of ["societyId", "role", "academicSession", "status", "isOngoing"]) {
    if (filters[field] !== undefined) query[field] = filters[field];
  }
  if (filters.email) query.email = filters.email;
  if (filters.search) {
    const search = new RegExp(escapeRegex(filters.search), "i");
    query.$or = ["name", "email", "designation", "department"].map((field) => ({ [field]: search }));
  }
  const { items, totalItems } = await repository.findAll(query, filters.page, filters.limit);
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

const getLeadershipAssignment = async (id) => {
  assertLeadershipId(id);
  const leadership = await repository.findById(id);
  if (!leadership) throw new AppError("Leadership assignment not found", 404, "LEADERSHIP_NOT_FOUND");
  return leadership;
};

const updateLeadershipAssignment = async (id, data) => {
  const current = await getLeadershipAssignment(id);
  const merged = { ...current.toObject(), ...data };
  if (merged.isOngoing && merged.endDate) {
    throw new AppError("Ongoing assignments cannot have an endDate", 400, "INVALID_DATE_RANGE");
  }
  if (merged.startDate && merged.endDate && merged.endDate < merged.startDate) {
    throw new AppError("endDate cannot be before startDate", 400, "INVALID_DATE_RANGE");
  }
  if (data.societyId) {
    const society = await getExistingSociety(data.societyId);
    assertSocietyAllowsActiveAssignment(society, merged);
  }
  if (merged.status === LEADERSHIP_STATUSES.ACTIVE && merged.isOngoing) {
    const duplicate = await repository.findDuplicateAssignment({ ...duplicateFields(merged), excludeId: id });
    if (duplicate) throwDuplicate();
  }
  try {
    return await repository.updateById(id, data);
  } catch (error) {
    return handleDuplicate(error);
  }
};

const endLeadershipAssignment = async (id, { endDate, reason }) => {
  const current = await getLeadershipAssignment(id);
  if (current.startDate && endDate < current.startDate) {
    throw new AppError("endDate cannot be before startDate", 400, "INVALID_DATE_RANGE");
  }
  return repository.endAssignment(id, endDate, reason);
};

const updateLeadershipStatus = async (id, status) => {
  const current = await getLeadershipAssignment(id);
  if (current.status === LEADERSHIP_STATUSES.ENDED) {
    throw new AppError("An ended assignment cannot be reactivated", 400, "INVALID_DATE_RANGE");
  }
  if (status === LEADERSHIP_STATUSES.ACTIVE) {
    const society = await getExistingSociety(current.societyId);
    assertSocietyAllowsActiveAssignment(society, current);
    if (await repository.findDuplicateAssignment({ ...duplicateFields(current), excludeId: id })) throwDuplicate();
  }
  try {
    return await repository.updateStatus(id, status);
  } catch (error) {
    return handleDuplicate(error);
  }
};

const getActiveSocietyApprovers = async (societyId, academicSession) => {
  await getExistingSociety(societyId);
  return repository.findActiveBySociety(societyId, academicSession);
};

// Import migration helper only; intentionally not exposed through HTTP routes.
const createLeadershipFromImportPreview = async ({ societyId, presidentPreview, academicSession }) => {
  const name = presidentPreview?.name?.trim();
  const email = presidentPreview?.email?.trim().toLowerCase();
  if (!name || !email) return { skipped: true, reason: "PRESIDENT_NAME_OR_EMAIL_MISSING" };
  const data = {
    societyId,
    role: LEADERSHIP_ROLES.PRESIDENT,
    name,
    email,
    designation: presidentPreview.designation?.trim() || undefined,
    academicSession,
    metadata: { importSource: "SOCIETY_EXCEL", importedFromPresidentPreview: true },
  };
  if (await repository.findDuplicateAssignment(duplicateFields(data))) {
    return { skipped: true, reason: "LEADERSHIP_ASSIGNMENT_EXISTS" };
  }
  return { skipped: false, leadership: await createLeadershipAssignment(data) };
};

module.exports = {
  createLeadershipAssignment,
  listLeadershipAssignments,
  getLeadershipAssignment,
  updateLeadershipAssignment,
  endLeadershipAssignment,
  updateLeadershipStatus,
  getActiveSocietyApprovers,
  createLeadershipFromImportPreview,
};
