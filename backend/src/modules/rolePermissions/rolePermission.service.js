const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Role = require("../roles/role.model");
const UserRoleAssignment = require("../userRoleAssignments/userRoleAssignment.model");
const Permission = require("../permissions/permission.model");
const Mapping = require("./rolePermission.model");
const repo = require("./rolePermission.repository");
const valid = (id) =>
  mongoose.Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(String(id));
const getRolePermissions = async (roleId) => {
  if (!valid(roleId))
    throw new AppError("Invalid role ID", 400, "INVALID_ROLE_ID");
  if (!(await Role.exists({ _id: roleId })))
    throw new AppError("Role not found", 404, "ROLE_NOT_FOUND");
  return repo.findByRole(roleId);
};
const replaceRolePermissions = async (
  roleId,
  permissions,
  actorId,
  options = {}
) => {
  if (!valid(roleId))
    throw new AppError("Invalid role ID", 400, "INVALID_ROLE_ID");
  const role = await Role.findById(roleId);
  if (!role) throw new AppError("Role not found", 404, "ROLE_NOT_FOUND");
  const ids = permissions.map((x) => x.permissionId);
  if (
    new Set(ids.map(String)).size !== ids.length ||
    ids.some((id) => !valid(id))
  )
    throw new AppError(
      "Invalid role permission mapping",
      400,
      "INVALID_ROLE_PERMISSION_MAPPING"
    );
  const found = await Permission.find({ _id: { $in: ids } });
  if (found.length !== ids.length)
    throw new AppError("Invalid permission ID", 400, "INVALID_PERMISSION_ID");
  if (!options.allowDeprecated && found.some((p) => p.status !== "ACTIVE"))
    throw new AppError(
      "Only active permissions can be assigned",
      400,
      "INVALID_ROLE_PERMISSION_MAPPING"
    );
  if (
    role.code === "SUPER_ADMIN" &&
    (found.length < (await Permission.countDocuments({ status: "ACTIVE" })) || permissions.some(item=>item.effect&&item.effect!=="ALLOW"))
  )
    throw new AppError(
      "SUPER_ADMIN full access cannot be removed",
      403,
      "SYSTEM_ROLE_PROTECTED"
    );
  const before = await Mapping.find({ roleId }).lean();
  const wanted = new Set(ids.map(String));
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Mapping.updateMany(
        { roleId, permissionId: { $nin: ids } },
        { $set: { isActive: false, updatedBy: actorId } },
        { session }
      );
      if (permissions.length) await Mapping.bulkWrite(
        permissions.map((item) => ({ updateOne: {
          filter: { roleId, permissionId: item.permissionId },
          update: { $set: { effect: item.effect || "ALLOW", dataScope: item.dataScope || "NONE", conditions: item.conditions || {}, isActive: true, updatedBy: actorId }, $setOnInsert: { createdBy: actorId } },
          upsert: true,
        } })),
        { session, ordered: true }
      );
    });
  } finally {
    await session.endSession();
  }
  const mappings = await repo.findByRole(roleId);
  const societyIds = await UserRoleAssignment.find({ roleId, scopeType: "SOCIETY", status: "ACTIVE", isOngoing: true }).distinct("societyId");
  if (societyIds.length) await require("../verificationRouting/verificationRouting.service").reconcilePendingClaims({ societyIds });
  return {
    mappings,
    audit: {
      entityType: "RolePermission",
      entityId: roleId,
      operation: "BULK_REPLACE",
      before,
      after: mappings.map((x) => x.toObject ? x.toObject() : x),
      actorId: actorId || null,
      metadata: { activeCount: wanted.size },
    },
  };
};
module.exports = { getRolePermissions, replaceRolePermissions };
