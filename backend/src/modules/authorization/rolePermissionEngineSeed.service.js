const Permission = require("../permissions/permission.model"),
  Role = require("../roles/role.model"),
  Mapping = require("../rolePermissions/rolePermission.model");
const { seedPermissions } = require("../permissions/permissionSeed.service"),
  { seedRoles } = require("../roles/roleSeed.service");
const presets = {
  ADMIN: [
    "dashboard.admin.view",
    "event.page.view",
    "event.view",
    "society.",
    "leadership.",
    "budget.",
    "student.",
    "user.",
    "user_role_assignment.",
    "profile.verification.",
    "profile.unlock.approve",
    "membership.",
    "notification.",
    "verification.",
    "event.approval.",
    "event.review.queue.view",
    "event.review.view",
    "event.review.forward",
    "event.review.amend",
    "event.review.request_changes",
    "event.review.reject",
  ],
  ASSISTANT: [
    "dashboard.admin.view",
    "society.page.view",
    "society.view",
    "leadership.view",
    "student.view",
    "profile.verification.",
    "notification.",
    "verification.",
    "event.approval.",
    "event.review.queue.view",
    "event.review.view",
    "event.review.forward",
    "event.review.reject",
  ],
  PRESIDENT: [
    "dashboard.admin.view",
    "society.view",
    "leadership.",
    "budget.view",
    "budget.transactions.view",
    "budget.summary.view",
    "membership.",
    "notification.",
    "verification.",
    "event.page.view",
    "event.view",
    "event.list_society",
    "event.approval.",
    "event.review.queue.view",
    "event.review.view",
    "event.review.forward",
    "event.review.amend",
    "event.review.request_changes",
    "event.review.reject",
  ],
  DOSA_STAFF: [
    "dashboard.admin.view",
    "event.page.view",
    "event.view",
    "event.list_society",
    "event.approval.",
    "event.review.queue.view",
    "event.review.view",
    "event.review.forward",
    "event.review.reject",
    "event.budget_review.view",
    "event.budget_review.edit",
    "notification.",
  ],
  ADOSA: [
    "dashboard.admin.view",
    "society.page.view",
    "society.view",
    "student.page.view",
    "student.view",
    "membership.view",
    "membership.history.view",
    "verification.queue.view",
    "verification.claim.view",
    "event.page.view",
    "event.view",
    "event.review.queue.view",
    "event.review.view",
    "event.review.forward",
    "event.review.reject",
    "notification.",
  ],
  DOSA: [
    "dashboard.admin.view",
    "event.page.view",
    "event.view",
    "event.list_society",
    "event.review.queue.view",
    "event.review.view",
    "event.review.final_approve",
    "event.review.request_changes",
    "event.review.reject",
    "notification.",
  ],
  VICE_PRESIDENT: [
    "dashboard.admin.view",
    "society.view",
    "leadership.view",
    "budget.view",
    "budget.summary.view",
    "membership.",
    "notification.",
    "verification.",
  ],
  GENERAL_SECRETARY: [
    "dashboard.student.view",
    "society.view",
    "leadership.view",
    "student.view",
    "membership.",
    "profile.",
    "event.",
    "venue.",
    "night_permission.",
    "certificate.",
    "notification.",
    "verification.",
  ],
  VICE_GENERAL_SECRETARY: [
    "dashboard.student.view",
    "verification.queue.view",
    "verification.claim.view",
    "verification.claim.approve",
    "verification.claim.reject",
    "verification.claim.request_changes",
    "verification.claim.review.lower_roles",
    "notification.",
  ],
  SECRETARY: [
    "dashboard.student.view",
    "verification.queue.view",
    "verification.claim.view",
    "verification.claim.approve",
    "verification.claim.reject",
    "verification.claim.request_changes",
    "verification.claim.review.lower_roles",
    "notification.",
  ],
  MEMBER: [
    "dashboard.student.view",
    "membership.view",
    "event.page.view",
    "event.view",
    "event.list_society",
    "notification.view",
  ],
  VOLUNTEER: [
    "dashboard.student.view",
    "profile.page.view",
    "profile.view",
    "profile.save",
    "membership.join.request",
    "membership.view",
    "membership.join.cancel",
    "event.page.view",
    "event.view",
    "event.list_society",
    "notification.view",
    "notification.mark_read",
  ],
};
const match = (code, patterns) =>
  patterns.some((p) => (p.endsWith(".") ? code.startsWith(p) : code === p));
const capabilityRoles = {
  "verification.claim.review.higher_roles": new Set(["PRESIDENT", "VICE_PRESIDENT"]),
  "verification.claim.review.lower_roles": new Set(["GENERAL_SECRETARY", "VICE_GENERAL_SECRETARY", "SECRETARY"]),
};
const allowedDefaultCapability = (role, permission) =>
  !capabilityRoles[permission.code] || capabilityRoles[permission.code].has(role.code);
const seedMappings = async () => {
  const permissions = await Permission.find({ status: "ACTIVE" }).lean(),
    roles = await Role.find({
      code: { $in: ["SUPER_ADMIN", ...Object.keys(presets)] },
    }).lean();
  let created = 0,
    total = 0;
  for (const role of roles) {
    const selected =
      role.code === "SUPER_ADMIN"
        ? permissions
        : permissions.filter((p) => match(p.code, presets[role.code] || []) && allowedDefaultCapability(role, p));
    await Mapping.deleteMany({
      roleId: role._id,
      permissionId: { $nin: selected.map((permission) => permission._id) },
    });
    for (const p of selected) {
      total++;
      const scope = role.scopeType === "SOCIETY" ? "SOCIETY" : "ALL";
      const r = await Mapping.updateOne(
        { roleId: role._id, permissionId: p._id },
        {
          $setOnInsert: {
            effect: "ALLOW",
            dataScope: scope,
            conditions: {},
            isActive: true,
          },
        },
        { upsert: true }
      );
      if (r.upsertedCount) created++;
    }
  }
  return { total, created, existing: total - created };
};
const seedRolePermissionEngine = async () => {
  const permissions = await seedPermissions(),
    roles = await seedRoles(),
    mappings = await seedMappings();
  return { permissions, roles, mappings };
};
module.exports = {
  seedRolePermissionEngine,
  seedMappings,
  defaultPresets: presets,
};
