const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const repo = require("./role.repository");
const Role = require("./role.model");
const RolePermission = require("../rolePermissions/rolePermission.model");
const UserRoleAssignment = require("../userRoleAssignments/userRoleAssignment.model");
const valid = (id) =>
  mongoose.Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(String(id));
const getRole = async (id) => {
  if (!valid(id)) throw new AppError("Invalid role ID", 400, "INVALID_ROLE_ID");
  const item = await repo.findById(id);
  if (!item) throw new AppError("Role not found", 404, "ROLE_NOT_FOUND");
  return item;
};
const wrap = (entity, operation, before, actorId) => ({
  entity,
  audit: {
    entityType: "Role",
    entityId: entity.id,
    operation,
    before,
    after: entity.toObject(),
    actorId: actorId || null,
    metadata: {},
  },
});
const createRole = async (data) => {
  if (await repo.findByCode(data.code))
    throw new AppError("Role code already exists", 409, "ROLE_CODE_EXISTS");
  try {
    return wrap(await repo.create(data), "CREATE", null, data.createdBy);
  } catch (e) {
    if (e.code === 11000)
      throw new AppError("Role code already exists", 409, "ROLE_CODE_EXISTS");
    throw e;
  }
};
const listRoles = async (f) => {
  const q = {};
  if (f.search)
    q.$or = ["code", "name", "description"].map((k) => ({
      [k]: new RegExp(f.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    }));
  for (const k of ["category", "scopeType", "status"]) if (f[k]) q[k] = f[k];
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
const adminOverview = async (filters) => {
  const result = await listRoles(filters), roleIds = result.items.map((role) => role._id);
  const [permissionCounts, assignmentCounts] = await Promise.all([
    RolePermission.aggregate([{ $match: { roleId: { $in: roleIds }, isActive: { $ne: false } } }, { $group: { _id: "$roleId", count: { $sum: 1 } } }]),
    UserRoleAssignment.aggregate([{ $match: { roleId: { $in: roleIds }, status: "ACTIVE", isOngoing: { $ne: false } } }, { $group: { _id: "$roleId", count: { $sum: 1 } } }]),
  ]);
  const permissions = new Map(permissionCounts.map((row) => [String(row._id), row.count])), assignments = new Map(assignmentCounts.map((row) => [String(row._id), row.count]));
  return { ...result, items: result.items.map((role) => ({ ...(role.toObject ? role.toObject() : role), permissionCount: permissions.get(String(role._id)) || 0, activeAssignmentCount: assignments.get(String(role._id)) || 0 })) };
};
const updateRole = async (id, data) => {
  const old = await getRole(id);
  if (old.code === "SUPER_ADMIN")
    throw new AppError("SUPER_ADMIN definition is immutable",403,"SYSTEM_ROLE_PROTECTED");
  if (old.isSystemRole && data.code && data.code !== old.code)
    throw new AppError(
      "System role code is protected",
      403,
      "SYSTEM_ROLE_PROTECTED"
    );
  if (data.code && (await Role.exists({ code: data.code, _id: { $ne: id } })))
    throw new AppError("Role code already exists", 409, "ROLE_CODE_EXISTS");
  return wrap(
    await repo.updateById(id, data),
    "UPDATE",
    old.toObject(),
    data.updatedBy
  );
};
const updateStatus = async (id, status, actorId) => {
  const old = await getRole(id);
  if (old.code === "SUPER_ADMIN" && status !== "ACTIVE")
    throw new AppError(
      "SUPER_ADMIN cannot be deactivated or archived",
      403,
      "SYSTEM_ROLE_PROTECTED"
    );
  return wrap(
    await repo.updateById(id, { status, updatedBy: actorId }),
    "STATUS_CHANGE",
    old.toObject(),
    actorId
  );
};
module.exports = { createRole, listRoles, adminOverview, getRole, updateRole, updateStatus };
