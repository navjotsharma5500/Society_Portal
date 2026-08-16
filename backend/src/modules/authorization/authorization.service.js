const mongoose = require("mongoose");
const User = require("../users/user.model");
const Permission = require("../permissions/permission.model");
const Mapping = require("../rolePermissions/rolePermission.model");
const Assignment = require("../userRoleAssignments/userRoleAssignment.model");
const {
  activeWindow,
} = require("../userRoleAssignments/userRoleAssignment.service");
const { AUTHORIZATION_REASONS: R } = require("./authorization.constants");
const resolveAssignments = async (userId) =>
  (
    await Assignment.find({ userId, ...activeWindow(new Date()) })
      .populate("roleId")
      .lean()
  ).filter((assignment) => assignment.roleId?.status === "ACTIVE");
const resolvePrimaryDashboardRole = async (userId) => {
  const assignments = await resolveAssignments(userId);
  assignments.sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      (b.roleId?.rank || 0) - (a.roleId?.rank || 0) ||
      (a.scopeType === b.scopeType ? 0 : a.scopeType === "GLOBAL" ? -1 : 1) ||
      new Date(b.validFrom || b.createdAt) -
        new Date(a.validFrom || a.createdAt)
  );
  const assignment = assignments[0];
  return assignment
    ? {
        assignmentId: assignment._id,
        role: assignment.roleId,
        dashboardKey: assignment.roleId.dashboardKey || null,
        scopeType: assignment.scopeType,
        societyId: assignment.societyId || null,
      }
    : null;
};
const getEffectivePermissions = async ({ userId, societyId }) => {
  const now = new Date(), match = {
    userId: new mongoose.Types.ObjectId(userId),
    ...activeWindow(now),
    ...(societyId ? { $and: [
      ...(activeWindow(now).$and || []),
      { $or: [{ scopeType: "GLOBAL" }, { scopeType: "SOCIETY", societyId: new mongoose.Types.ObjectId(societyId) }] },
    ], $or: activeWindow(now).$or } : {}),
  };
  const rows = await Assignment.aggregate([
    { $match: match },
    { $lookup: { from: "roles", localField: "roleId", foreignField: "_id", as: "role" } },
    { $unwind: "$role" },
    { $match: { "role.status": "ACTIVE" } },
    { $lookup: { from: "rolepermissions", localField: "roleId", foreignField: "roleId", as: "mapping" } },
    { $unwind: { path: "$mapping", preserveNullAndEmptyArrays: true } },
    { $match: { $or: [{ "mapping.isActive": true }, { mapping: { $exists: false } }] } },
    { $lookup: { from: "permissions", localField: "mapping.permissionId", foreignField: "_id", as: "permission" } },
    { $unwind: { path: "$permission", preserveNullAndEmptyArrays: true } },
  ]);
  const assignmentMap = new Map();
  for (const row of rows) if (!assignmentMap.has(String(row._id))) assignmentMap.set(String(row._id), { ...row, roleId: row.role });
  const assignments = [...assignmentMap.values()];
  const superAssignment = assignments.find(
    (a) => a.roleId.code === "SUPER_ADMIN" && a.scopeType === "GLOBAL"
  );
  if (superAssignment) {
    const databasePermissions = await Permission.find({ status: "ACTIVE" }).lean();
    const registeredPermissions = require("../permissions/permissionRegistry").listRegisteredPermissions();
    const permissionsByCode = new Map(databasePermissions.map((permission) => [permission.code, permission]));
    for (const registered of registeredPermissions) if (!permissionsByCode.has(registered.code)) permissionsByCode.set(registered.code, registered);
    const permissions = [...permissionsByCode.values()];
    return {
      assignments,
      permissions: permissions.map((p) => ({
        ...p,
        effect: "ALLOW",
        dataScope: "ALL",
        sourceRoleCodes: ["SUPER_ADMIN"],
      })),
    };
  }
  const byCode = new Map();
  for (const row of rows) {
    const m = row.mapping, p = row.permission;
    if (!p || p.status !== "ACTIVE") continue;
    const source = assignmentMap.get(String(row._id));
    const current = byCode.get(p.code);
    const entry = {
      ...p,
      effect: m.effect,
      dataScope: m.dataScope,
      conditions: m.conditions,
      sourceRoleCodes: [
        ...new Set([...(current?.sourceRoleCodes || []), source.roleId.code]),
      ],
      matchedAssignments: [...(current?.matchedAssignments || []), source._id],
    };
    if (!current || m.effect === "DENY") byCode.set(p.code, entry);
    else current.sourceRoleCodes = entry.sourceRoleCodes;
  }
  return { assignments, permissions: [...byCode.values()] };
};
const hasPermission = async ({
  userId,
  permissionCode,
  societyId,
  resourceOwnerId,
  user: authenticatedUser,
}) => {
  if (!mongoose.Types.ObjectId.isValid(userId))
    return {
      allowed: false,
      reason: R.USER_INACTIVE,
      matchedAssignments: [],
      effectivePermission: null,
      dataScope: "NONE",
    };
  const user = authenticatedUser || await User.findById(userId).lean();
  if (!user || ["INACTIVE", "SUSPENDED"].includes(user.status))
    return {
      allowed: false,
      reason: R.USER_INACTIVE,
      matchedAssignments: [],
      effectivePermission: null,
      dataScope: "NONE",
    };
  if (!user.isLoginAllowed)
    return {
      allowed: false,
      reason: R.USER_LOGIN_DISABLED,
      matchedAssignments: [],
      effectivePermission: null,
      dataScope: "NONE",
    };
  const now = new Date(), window = activeWindow(now), scopeMatch = societyId
    ? { $or: [{ scopeType: "GLOBAL" }, { scopeType: "SOCIETY", societyId: new mongoose.Types.ObjectId(societyId) }] }
    : { scopeType: "GLOBAL" };
  const rows = await Assignment.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), ...window, $and: [...(window.$and || []), scopeMatch] } },
    { $lookup: { from: "roles", localField: "roleId", foreignField: "_id", as: "role" } },
    { $unwind: "$role" },
    { $match: { "role.status": "ACTIVE" } },
    { $lookup: { from: "rolepermissions", let: { roleId: "$roleId" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$roleId", "$$roleId"] }, { $eq: ["$isActive", true] }] } } },
      { $lookup: { from: "permissions", localField: "permissionId", foreignField: "_id", as: "permission" } },
      { $unwind: "$permission" },
      { $match: { "permission.code": permissionCode, "permission.status": "ACTIVE" } },
    ], as: "matches" } },
    { $match: { $or: [{ "role.code": "SUPER_ADMIN" }, { "matches.0": { $exists: true } }] } },
    { $project: { _id: 1, roleCode: "$role.code", matches: 1 } },
  ]);
  const superRow = rows.find((row) => row.roleCode === "SUPER_ADMIN"), permissionRows = rows.flatMap((row) => row.matches.map((mapping) => ({ ...mapping.permission, effect: mapping.effect, dataScope: mapping.dataScope, conditions: mapping.conditions, assignmentId: row._id, roleCode: row.roleCode })));
  const denied = permissionRows.find((permission) => permission.effect === "DENY"), granted = permissionRows.find((permission) => permission.effect === "ALLOW"), p = denied || granted || (superRow ? { code: permissionCode, effect: "ALLOW", dataScope: "ALL", sourceRoleCodes: ["SUPER_ADMIN"] } : null);
  let allowed = Boolean(p && p.effect === "ALLOW");
  if (
    allowed &&
    p.dataScope === "OWN" &&
    (!resourceOwnerId || String(resourceOwnerId) !== String(userId))
  )
    allowed = false;
  return {
    allowed,
    reason: allowed
      ? superRow
        ? R.SUPER_ADMIN
        : R.GRANTED
      : R.PERMISSION_DENIED,
    matchedAssignments: superRow ? [superRow._id] : permissionRows.map((permission) => permission.assignmentId),
    effectivePermission: p || null,
    dataScope: p?.dataScope || "NONE",
  };
};
const getUiCapabilities = async ({ userId, societyId }) => {
  const { permissions } = await getEffectivePermissions({ userId, societyId });
  const allowed = permissions.filter((p) => p.effect === "ALLOW");
  const keys = (type) =>
    allowed
      .filter((p) => p.permissionType === type && p.uiKey)
      .map((p) => p.uiKey);
  return {
    permissionCodes: allowed.map((p) => p.code),
    uiKeys: [...new Set(allowed.map((p) => p.uiKey).filter(Boolean))],
    routes: [...new Set(allowed.map((p) => p.route).filter(Boolean))],
    buttons: keys("BUTTON"),
    menus: keys("MENU"),
    fields: keys("FIELD"),
  };
};
module.exports = {
  hasPermission,
  getEffectivePermissions,
  getUiCapabilities,
  resolvePrimaryDashboardRole,
};
