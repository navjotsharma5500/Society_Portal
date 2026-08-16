const mongoose = require("mongoose"),
  AppError = require("../../common/errors/AppError"),
  repo = require("./userRoleAssignment.repository"),
  Assignment = require("./userRoleAssignment.model"),
  Role = require("../roles/role.model"),
  User = require("../users/user.model"),
  Society = require("../societies/society.model"),
  environment = require("../../config/environment");
const events = require("../../common/events/domainEvent.service");
const emit = (result) => { events.publish("ROLE_ASSIGNMENT_UPDATED", { userId: result.entity.userId, metadata: { assignmentId: String(result.entity._id), societyId: result.entity.societyId ? String(result.entity.societyId) : undefined } }); return result; };
const valid = (id) =>
  mongoose.Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(String(id));
const activeWindow = (now) => ({
  status: "ACTIVE",
  $or: [
    { isOngoing: true },
    {
      $and: [
        {
          $or: [
            { validFrom: null },
            { validFrom: { $exists: false } },
            { validFrom: { $lte: now } },
          ],
        },
        {
          $or: [
            { validUntil: null },
            { validUntil: { $exists: false } },
            { validUntil: { $gte: now } },
          ],
        },
      ],
    },
  ],
});
const getAssignment = async (id) => {
  if (!valid(id))
    throw new AppError("Invalid assignment ID", 400, "INVALID_ASSIGNMENT_ID");
  const item = await repo.findById(id);
  if (!item)
    throw new AppError(
      "Role assignment not found",
      404,
      "ROLE_ASSIGNMENT_NOT_FOUND"
    );
  return item;
};
const wrap = (entity, operation, before, actorId) => ({
  entity,
  audit: {
    entityType: "UserRoleAssignment",
    entityId: entity.id,
    operation,
    before,
    after: entity.toObject(),
    actorId: actorId || null,
    metadata: {},
  },
});
const createAssignment = async (data) => {
  if (!valid(data.userId) || !(await User.exists({ _id: data.userId })))
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  if (!valid(data.roleId))
    throw new AppError("Invalid role ID", 400, "INVALID_ROLE_ID");
  const role = await Role.findById(data.roleId);
  if (!role) throw new AppError("Role not found", 404, "ROLE_NOT_FOUND");
  if (role.code === "SUPER_ADMIN") {
    const target = await User.findById(data.userId).select("email").lean();
    if (!environment.superAdminEmails.includes(target.email.trim().toLowerCase()))
      throw new AppError("Only approved identities may hold SUPER_ADMIN",403,"SUPER_ADMIN_ASSIGNMENT_FORBIDDEN");
    throw new AppError("SUPER_ADMIN assignments are managed only by the protected bootstrap",403,"SYSTEM_ROLE_PROTECTED");
  }
  const targetUser=await User.findById(data.userId).select("accountType").lean(),studentIdentity=targetUser.accountType==="STUDENT";
  if((studentIdentity&&!role.isStudentRole)||(!studentIdentity&&role.isStudentRole&&!role.isLeadershipRole))
    throw new AppError("Role is incompatible with the target account type",400,"ROLE_ACCOUNT_TYPE_INCOMPATIBLE");
  if (role.status !== "ACTIVE" || !role.isAssignable)
    throw new AppError(
      "Role is inactive or not assignable",
      409,
      "ROLE_INACTIVE"
    );
  if (![data.scopeType, "BOTH"].includes(role.scopeType))
    throw new AppError(
      "Role does not support this scope",
      400,
      "ROLE_ASSIGNMENT_SCOPE_INVALID"
    );
  if (data.scopeType === "SOCIETY") {
    if (
      !valid(data.societyId) ||
      !(await Society.exists({ _id: data.societyId }))
    )
      throw new AppError(
        "A valid society is required",
        400,
        "ROLE_ASSIGNMENT_SCOPE_INVALID"
      );
    const max = role.allowsMultipleSocieties ? role.maxConcurrentSocieties : 1;
    if (max !== null) {
      const count = await Assignment.countDocuments({
        userId: data.userId,
        roleId: data.roleId,
        scopeType: "SOCIETY",
        ...activeWindow(new Date()),
      });
      if (count >= max)
        throw new AppError(
          "Role concurrent society limit reached",
          409,
          "ROLE_CONCURRENT_SOCIETY_LIMIT_REACHED"
        );
    }
  } else if (data.societyId)
    throw new AppError(
      "societyId must be null for global scope",
      400,
      "ROLE_ASSIGNMENT_SCOPE_INVALID"
    );
  const duplicate = await Assignment.exists({
    userId: data.userId,
    roleId: data.roleId,
    scopeType: data.scopeType,
    societyId: data.scopeType === "GLOBAL" ? null : data.societyId,
    academicSession: data.academicSession || null,
    status: "ACTIVE",
    isOngoing: true,
  });
  if (duplicate)
    throw new AppError(
      "Active role assignment already exists",
      409,
      "ROLE_ASSIGNMENT_EXISTS"
    );
  try {
    return emit(wrap(
      await repo.create({
        ...data,
        societyId: data.scopeType === "GLOBAL" ? null : data.societyId,
        academicSession: data.academicSession || null,
      }),
      "CREATE",
      null,
      data.createdBy
    ));
  } catch (e) {
    if (e.code === 11000)
      throw new AppError(
        "Active role assignment already exists",
        409,
        "ROLE_ASSIGNMENT_EXISTS"
      );
    throw e;
  }
};
const listAssignments = async (f) => {
  const q = {};
  for (const k of [
    "userId",
    "roleId",
    "societyId",
    "status",
    "scopeType",
    "isOngoing",
  ])
    if (f[k] !== undefined) q[k] = f[k];
  const r = await repo.findAll(q, f.page, f.limit);
  return {
    items: r.items,
    pagination: {
      page: f.page,
      limit: f.limit,
      totalItems: r.totalItems,
      totalPages: Math.ceil(r.totalItems / f.limit),
    },
  };
};
const updateAssignment = async (id, data) => {
  const old = await getAssignment(id);
  await assertSuperAdminSafety(old);
  for (const immutable of [
    "userId",
    "roleId",
    "scopeType",
    "societyId",
    "academicSession",
  ])
    if (
      data[immutable] !== undefined &&
      String(data[immutable] || "") !== String(old[immutable] || "")
    )
      throw new AppError(
        `${immutable} cannot be changed`,
        400,
        "ROLE_ASSIGNMENT_SCOPE_INVALID"
      );
  return emit(wrap(
    await repo.updateById(id, data),
    "UPDATE",
    old.toObject(),
    data.updatedBy
  ));
};
const assertSuperAdminSafety = async (item) => {
  const role = item.roleId.code
    ? item.roleId
    : await Role.findById(item.roleId);
  if (role.code !== "SUPER_ADMIN") return;
  throw new AppError("Bootstrap SUPER_ADMIN assignments cannot be changed through role management",403,"SYSTEM_ROLE_PROTECTED");
};
const finish = async (id, status, actorId, remarks) => {
  const old = await getAssignment(id);
  await assertSuperAdminSafety(old, actorId);
  const item = await repo.updateById(id, {
    status,
    isOngoing: false,
    validUntil: new Date(),
    remarks: remarks || old.remarks,
    updatedBy: actorId,
  });
  return emit(wrap(item, status, old.toObject(), actorId));
};
const getActiveForUser = (userId) => {
  if (!valid(userId))
    throw new AppError("Invalid user ID", 400, "INVALID_USER_ID");
  return Assignment.find({ userId, ...activeWindow(new Date()) })
    .populate("roleId")
    .populate("societyId")
    .sort({ isPrimary: -1, createdAt: -1 });
};
module.exports = {
  createAssignment,
  listAssignments,
  getAssignment,
  updateAssignment,
  endAssignment: (id, a, r) => finish(id, "ENDED", a, r),
  revokeAssignment: (id, a, r) => finish(id, "REVOKED", a, r),
  getActiveForUser,
  activeWindow,
};
