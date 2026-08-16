const RolePermission = require("./rolePermission.model");
const findByRole = roleId => RolePermission.find({ roleId, isActive: true }).populate("permissionId").lean();
const findForRoles = roleIds => RolePermission.find({ roleId: { $in: roleIds }, isActive: true }).populate("permissionId");
module.exports = { findByRole, findForRoles };
