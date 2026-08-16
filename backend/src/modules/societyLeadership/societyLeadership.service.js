const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Society = require("../societies/society.model");
const User = require("../users/user.model");
const Role = require("../roles/role.model");
const Assignment = require("../userRoleAssignments/userRoleAssignment.model");
const assignmentService = require("../userRoleAssignments/userRoleAssignment.service");
const events = require("../../common/events/domainEvent.service");
const repository = require("./societyLeadership.repository");
const { LEADERSHIP_ROLES, LEADERSHIP_STATUSES } = require("./societyLeadership.constants");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  let scopedAssignment=null;
  if(data.userId){
    const user=await User.findById(data.userId).select("displayName email profilePhotoUrl profilePictureUrl metadata accountType");
    if(!user)throw new AppError("User not found",404,"USER_NOT_FOUND");
    const role=await Role.findOne({code:data.role,status:"ACTIVE",isAssignable:true,isLeadershipRole:true,scopeType:{$in:["SOCIETY","BOTH"]}});
    if(!role)throw new AppError("Leadership role is inactive, incompatible, or not assignable",409,"ROLE_INACTIVE");
    data={...data,name:user.displayName,email:user.email,contactNumber:user.metadata?.contactNumber||user.metadata?.contact,department:user.metadata?.department,designation:user.metadata?.designation,metadata:{...(data.metadata||{}),roleId:role._id}};
    const result=await assignmentService.createAssignment({userId:user._id,roleId:role._id,scopeType:"SOCIETY",societyId:data.societyId,academicSession:data.academicSession,validFrom:data.startDate,validUntil:data.endDate,isOngoing:data.isOngoing!==false,status:data.status||"ACTIVE",assignmentSource:"IMPORT",createdBy:data.createdBy});
    scopedAssignment=result.entity;
  }
  assertSocietyAllowsActiveAssignment(society, data);
  if (await repository.findDuplicateAssignment(duplicateFields(data))) { if(scopedAssignment)await assignmentService.endAssignment(scopedAssignment._id,data.createdBy,"Leadership creation rolled back"); throwDuplicate(); }
  try {
    const leadership=await repository.create(data);events.publish("SOCIETY_LEADERSHIP_UPDATED",{userId:data.userId,metadata:{societyId:String(data.societyId),leadershipId:String(leadership._id)}});return leadership;
  } catch (error) {
    if(scopedAssignment)await assignmentService.endAssignment(scopedAssignment._id,data.createdBy,"Leadership creation rolled back").catch(()=>{});
    return handleDuplicate(error);
  }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const listLeadershipAssignments = async (filters, req) => {
  const query = {};
  for (const field of ["societyId", "role", "academicSession", "status", "isOngoing"]) {
    if (filters[field] !== undefined) query[field] = filters[field];
  }
  if (filters.email) query.email = filters.email;
  if (filters.search) {
    const search = new RegExp(escapeRegex(filters.search), "i");
    query.$or = ["name", "email", "designation", "department"].map((field) => ({ [field]: search }));
  }
  const { items, totalItems } = await repository.findAll(query, filters.page, filters.limit, req);
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

const endLeadershipAssignment = async (id, { endDate, reason, updatedBy }) => {
  const current = await getLeadershipAssignment(id);
  if (current.startDate && endDate < current.startDate) {
    throw new AppError("endDate cannot be before startDate", 400, "INVALID_DATE_RANGE");
  }
  const ended=await repository.endAssignment(id,endDate,reason);
  if(current.userId){const role=await Role.findOne({code:current.role}).select("_id").lean();if(role){const assignment=await Assignment.findOne({userId:current.userId,roleId:role._id,scopeType:"SOCIETY",societyId:current.societyId,academicSession:current.academicSession,status:"ACTIVE",isOngoing:true});if(assignment)await assignmentService.endAssignment(assignment._id,updatedBy,reason)}}
  events.publish("SOCIETY_LEADERSHIP_UPDATED",{userId:current.userId,metadata:{societyId:String(current.societyId),leadershipId:String(current._id)}});return ended;
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
  if (!name) return { status: "SKIPPED", reason: "PRESIDENT_NAME_MISSING" };
  if (!email) return { status: "SKIPPED", reason: "PRESIDENT_EMAIL_MISSING" };
  if (!EMAIL_PATTERN.test(email)) return { status: "SKIPPED", reason: "PRESIDENT_EMAIL_INVALID" };
  const data = {
    societyId,
    role: LEADERSHIP_ROLES.PRESIDENT,
    name,
    email,
    designation: presidentPreview.designation?.trim() || undefined,
    academicSession,
    isOngoing: true,
    status: LEADERSHIP_STATUSES.ACTIVE,
    notificationEnabled: true,
    metadata: { importSource: "SOCIETY_EXCEL", importedFromPresidentPreview: true },
  };
  try {
    if (await repository.findDuplicateAssignment(duplicateFields(data))) {
      return { status: "DUPLICATE", reason: "LEADERSHIP_ASSIGNMENT_EXISTS" };
    }
    const leadership = await createLeadershipAssignment(data);
    return { status: "CREATED", reason: null, leadership };
  } catch (error) {
    if (error.code === "LEADERSHIP_ASSIGNMENT_EXISTS" || error.code === 11000) {
      return { status: "DUPLICATE", reason: "LEADERSHIP_ASSIGNMENT_EXISTS" };
    }
    return {
      status: "FAILED",
      reason: error.code || "LEADERSHIP_CREATION_FAILED",
      error: error.message,
    };
  }
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
