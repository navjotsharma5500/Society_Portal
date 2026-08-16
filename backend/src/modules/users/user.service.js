const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const repo = require("./user.repository");
const Student = require("../studentMaster/studentMaster.model");
const { USER_STATUSES, ACCOUNT_TYPES } = require("./user.constants");
const sessionService = require("../auth/session.service");
const Assignment = require("../userRoleAssignments/userRoleAssignment.model");
const { resolveProfilePicture } = require("../identity/profilePicture");
const valid = (id) =>
  mongoose.Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(String(id));
const get = async (id) => {
  if (!valid(id)) throw new AppError("Invalid user ID", 400, "INVALID_USER_ID");
  const user = await repo.findById(id).select("-googleSubject");
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  return user;
};
const list = async (f) => {
  const q = {};
  if (f.email) q.email = f.email;
  if (f.accountType) q.accountType = f.accountType;
  if (f.status) q.status = f.status;
  if (typeof f.isLoginAllowed === "boolean")
    q.isLoginAllowed = f.isLoginAllowed;
  const { items, totalItems } = await repo.findAll(q, f.page, f.limit);
  const plain=items.map(item=>item.toObject?item.toObject():item),studentIds=plain.map(item=>item.studentMasterId).filter(Boolean),userIds=plain.map(item=>item._id);
  const [students,assignments]=await Promise.all([Student.find({_id:{$in:studentIds}}).select("contactNumber branch course profilePictureUrl").lean(),Assignment.find({userId:{$in:userIds},...require("../userRoleAssignments/userRoleAssignment.service").activeWindow(new Date())}).populate("roleId").lean()]);
  const studentsById=new Map(students.map(student=>[String(student._id),student])),assignmentsByUser=new Map();
  for(const assignment of assignments){const key=String(assignment.userId);if(!assignmentsByUser.has(key))assignmentsByUser.set(key,[]);assignmentsByUser.get(key).push(assignment)}
  const projected=plain.map(user=>{const student=studentsById.get(String(user.studentMasterId)),studentAccount=user.accountType===ACCOUNT_TYPES.STUDENT;return{...user,profilePictureUrl:resolveProfilePicture(user,student),displayContact:user.metadata?.contactNumber||user.metadata?.contact||student?.contactNumber||null,displayDepartment:user.metadata?.department||student?.branch||null,displayDesignation:user.metadata?.designation||(studentAccount?"Student":null),activeAssignments:assignmentsByUser.get(String(user._id))||[]}});
  return {
    items: projected,
    pagination: {
      page: f.page,
      limit: f.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / f.limit),
    },
  };
};
const createUser = async (data) => {
  const normalization = require("../identity/identityNormalization"), email = normalization.normalizeEmail(data.email), normalizedContact = normalization.normalizeContact(data.metadata?.contactNumber || data.metadata?.contact);
  const resolution = (await require("../identity/identityResolution.service").batchResolve([{ email, contactNumber: normalizedContact }]))[0];
  if (resolution.classification !== "VALID") throw new AppError("The user already exists in the portal.", 409, resolution.classification === "IDENTITY_CONFLICT" ? "IDENTITY_CONFLICT" : "USER_ALREADY_EXISTS");
  if (await repo.findByEmail(email))
    throw new AppError(
      "A user with this email already exists",
      409,
      "USER_EMAIL_EXISTS"
    );
  try {
    return await repo.create({ ...data, email, normalizedContact: normalizedContact || undefined });
  } catch (error) {
    if (error.code === 11000)
      throw new AppError(
        "The user already exists in the portal.",
        409,
        "USER_ALREADY_EXISTS"
      );
    throw error;
  }
};
const updateUser=async(id,data)=>{const current=await get(id);return repo.updateById(id,{...data,...(data.metadata?{metadata:{...(current.metadata||{}),...data.metadata}}:{})})};
const status = async (id, data) => {
  await get(id);
  const user = await repo.updateById(id, {
    status: data.status,
    ...(data.status === USER_STATUSES.INACTIVE ||
    data.status === USER_STATUSES.SUSPENDED
      ? { isLoginAllowed: false }
      : {}),
    "metadata.statusReason": data.reason,
  });
  if ([USER_STATUSES.INACTIVE, USER_STATUSES.SUSPENDED].includes(data.status))
    await sessionService.revokeAllForUser(
      id,
      data.status === USER_STATUSES.SUSPENDED
        ? "ACCOUNT_SUSPENDED"
        : "ACCOUNT_INACTIVE"
    );
  return user;
};
const login = async (id, data) => {
  await get(id);
  const user = await repo.updateById(id, {
    isLoginAllowed: data.isLoginAllowed,
    "metadata.loginAccessReason": data.reason,
  });
  if (!data.isLoginAllowed)
    await sessionService.revokeAllForUser(id, "LOGIN_ACCESS_DISABLED");
  return user;
};
const findEligibleLoginIdentity = async (email) => {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  const user = await repo.findByEmail(normalized);
  if (!user)
    return {
      eligible: false,
      reason: "USER_NOT_FOUND",
      user: null,
      student: null,
    };
  let student = null;
  if (user.accountType === ACCOUNT_TYPES.STUDENT && user.studentMasterId)
    student = await Student.findById(user.studentMasterId);
  if (!user.isLoginAllowed || (student && !student.isLoginAllowed))
    return { eligible: false, reason: "LOGIN_DISABLED", user, student };
  if (student && student.recordStatus !== "ACTIVE")
    return { eligible: false, reason: "RECORD_INACTIVE", user, student };
  if (user.status === USER_STATUSES.PENDING_ONBOARDING)
    return { eligible: false, reason: "ONBOARDING_REQUIRED", user, student };
  if (
    user.status === USER_STATUSES.PENDING_APPROVAL ||
    (student && student.profileStatus === "PENDING_VERIFICATION")
  )
    return {
      eligible: false,
      reason: "PROFILE_PENDING_APPROVAL",
      user,
      student,
    };
  return {
    eligible: true,
    reason:
      student?.profileStatus === "APPROVED" ? "PROFILE_APPROVED" : "ELIGIBLE",
    user,
    student,
  };
};
const getEffectivePermissions = async (id) => {
  await get(id);
  const Assignment = require("../userRoleAssignments/userRoleAssignment.model");
  const RolePermission = require("../rolePermissions/rolePermission.model");
  const { activeWindow } = require("../userRoleAssignments/userRoleAssignment.service");
  const assignments = (await Assignment.find({ userId: id, ...activeWindow(new Date()) }).populate("roleId").lean()).filter((assignment) => assignment.roleId?.status === "ACTIVE");
  const superAdmin = assignments.some((assignment) => assignment.scopeType === "GLOBAL" && assignment.roleId?.code === "SUPER_ADMIN");
  const roleMappings = superAdmin ? [] : await RolePermission.find({ roleId: { $in: assignments.map((assignment) => assignment.roleId._id) }, isActive: true }).populate("permissionId").lean();
  const permissions = superAdmin
    ? require("../permissions/permissionRegistry").listRegisteredPermissions().map((permission) => ({ ...permission, effect: "ALLOW", dataScope: "ALL", sourceRoleCodes: ["SUPER_ADMIN"], scopeType: "GLOBAL", societyId: null }))
    : roleMappings.flatMap((mapping) => assignments.filter((assignment) => String(assignment.roleId._id) === String(mapping.roleId)).map((assignment) => ({ ...mapping.permissionId, effect: mapping.effect, dataScope: mapping.dataScope, sourceRoleCodes: [assignment.roleId.code], scopeType: assignment.scopeType, societyId: assignment.societyId || null })));
  return {
    roles: assignments.map((assignment) => ({ code: assignment.roleId?.code, name: assignment.roleId?.name, scopeType: assignment.scopeType, societyId: assignment.societyId || null })),
    permissions: permissions.map((permission) => ({ code: permission.code, displayName: permission.name, module: permission.module, resource: permission.resource, action: permission.action, effect: permission.effect, dataScope: permission.dataScope, scopeType: permission.scopeType, societyId: permission.societyId, sourceRoleCodes: permission.sourceRoleCodes || [] })),
  };
};
module.exports = {
  createUser,
  updateUser,
  getUser: get,
  listUsers: list,
  updateStatus: status,
  updateLoginAccess: login,
  findEligibleLoginIdentity,
  getEffectivePermissions,
};
