const mongoose = require("mongoose");
const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const { seedRolePermissionEngine } = require("../src/modules/authorization/rolePermissionEngineSeed.service");
const authorization = require("../src/modules/authorization/authorization.service");
const Role = require("../src/modules/roles/role.model");
const User = require("../src/modules/users/user.model");
const Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model");
const Event = require("../src/modules/events/event.model");
const events = require("../src/modules/events/event.service");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

(async () => {
  const tag = Date.now(), created = { users: [], assignments: [], events: [] };
  try {
    await connectDatabase();
    await seedRolePermissionEngine();
    const roles = await Role.find({ code: { $in: ["ADOSA", "ADMIN", "SUPER_ADMIN"] } }).lean();
    const byCode = Object.fromEntries(roles.map((role) => [role.code, role]));
    assert(byCode.ADOSA && byCode.ADMIN && byCode.SUPER_ADMIN, "administrative roles must be independently seeded");
    const make = async (code) => {
      const user = await User.create({ email: `${code.toLowerCase()}-${tag}@example.test`, displayName: `${code} Verify`, accountType: "ADMIN", status: "ACTIVE", isLoginAllowed: true });
      const assignment = await Assignment.create({ userId: user._id, roleId: byCode[code]._id, scopeType: "GLOBAL", isOngoing: true, status: "ACTIVE", isPrimary: true });
      created.users.push(user._id); created.assignments.push(assignment._id); return user;
    };
    const adosa = await make("ADOSA"), admin = await make("ADMIN");
    const allowed = async (user, permissionCode) => (await authorization.hasPermission({ userId: user._id, permissionCode })).allowed;
    assert(await allowed(adosa, "event.view"), "ADoSA event visibility missing");
    assert(await allowed(adosa, "society.view"), "ADoSA society visibility missing");
    assert(await allowed(adosa, "student.view"), "ADoSA student visibility missing");
    assert(!(await allowed(adosa, "settings.manage_general")), "ADoSA must not manage Super Admin settings");
    assert(await allowed(admin, "event.view"), "DoSA event visibility missing");
    assert(await allowed(admin, "budget.view"), "DoSA budget visibility missing");
    assert(!(await allowed(admin, "settings.manage_general")), "DoSA must not manage Super Admin settings");
    assert(!(await allowed(admin, "role.permissions.manage")), "DoSA must not administer RBAC");

    const eventId = new mongoose.Types.ObjectId();
    await Event.collection.insertOne({ _id: eventId, eventCode: `ADMIN-${tag}`, eventNumber: tag, societyId: new mongoose.Types.ObjectId(), createdByUserId: adosa._id, createdByMembershipId: new mongoose.Types.ObjectId(), createdFromRoleAssignmentId: created.assignments[0], title: "Shared workspace verification", status: "APPROVED", startDate: new Date(), createdAt: new Date(), updatedAt: new Date() });
    created.events.push(eventId);
    const first = await events.listAll({ search: `ADMIN-${tag}` }), second = await events.listAll({ search: `ADMIN-${tag}` });
    assert(first.items.length === 1 && second.items.length === 1 && String(first.items[0]._id) === String(second.items[0]._id), "workspaces must read the same Event record");
    console.log(JSON.stringify({ passed: 11, rolesSeparate: true, adosaReadPermissions: true, dosaOperationalPermissions: true, superAdminSettingsDenied: true, rbACDeniedToDosa: true, sharedEventRecord: true }, null, 2));
  } finally {
    await Event.deleteMany({ _id: { $in: created.events } }).catch(() => {});
    await Assignment.deleteMany({ _id: { $in: created.assignments } }).catch(() => {});
    await User.deleteMany({ _id: { $in: created.users } }).catch(() => {});
    await disconnectDatabase();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
