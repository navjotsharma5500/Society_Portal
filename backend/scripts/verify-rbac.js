process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||= "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||= "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  connectDatabase,
  disconnectDatabase,
} = require("../src/config/database");
const User = require("../src/modules/users/user.model"),
  Society = require("../src/modules/societies/society.model"),
  Role = require("../src/modules/roles/role.model"),
  Permission = require("../src/modules/permissions/permission.model"),
  Mapping = require("../src/modules/rolePermissions/rolePermission.model"),
  Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model");
const roleService = require("../src/modules/roles/role.service"),
  mappingService = require("../src/modules/rolePermissions/rolePermission.service"),
  assignmentService = require("../src/modules/userRoleAssignments/userRoleAssignment.service"),
  auth = require("../src/modules/authorization/authorization.service");
const ids = { users: [], societies: [], roles: [] };
const expectCode = async (fn, code) => {
  try {
    await fn();
    assert.fail(`Expected ${code}`);
  } catch (e) {
    assert.equal(e.code, code);
  }
};
(async () => {
  try {
    await connectDatabase();
    const stamp = Date.now().toString().slice(-8);
    const user = await User.create({
      email: `rbac-${stamp}@example.test`,
      displayName: "RBAC Verification",
      accountType: "FACULTY",
      status: "ACTIVE",
      isLoginAllowed: true,
    });
    ids.users.push(user._id);
    const studentUser=await User.create({email:`rbac-student-${stamp}@example.test`,displayName:"RBAC Student",accountType:"STUDENT",status:"ACTIVE",isLoginAllowed:true});
    ids.users.push(studentUser._id);
    for (const suffix of ["A", "B", "C"]) {
      const s = await Society.create({
        name: `RBAC Verify ${stamp} ${suffix}`,
        code: `R${stamp.slice(-5)}${suffix}`,
        category: "VERIFY",
      });
      ids.societies.push(s._id);
    }
    const view = await Permission.findOne({ code: "society.view" }),
      create = await Permission.findOne({ code: "society.create" });
    const customResult = await roleService.createRole({
      name: "RBAC Verify Allow",
      code: `VERIFY_ALLOW_${stamp}`,
      category: "CUSTOM",
      scopeType: "BOTH",
      rank: 50,
    });
    const denyResult = await roleService.createRole({
      name: "RBAC Verify Deny",
      code: `VERIFY_DENY_${stamp}`,
      category: "CUSTOM",
      scopeType: "SOCIETY",
      rank: 40,
    });
    ids.roles.push(customResult.entity._id, denyResult.entity._id);
    await mappingService.replaceRolePermissions(customResult.entity._id, [
      { permissionId: view._id, effect: "ALLOW", dataScope: "SOCIETY" },
      { permissionId: create._id, effect: "ALLOW", dataScope: "SOCIETY" },
    ]);
    let mappings = await mappingService.getRolePermissions(
      customResult.entity._id
    );
    assert.equal(mappings.length, 2);
    await mappingService.replaceRolePermissions(customResult.entity._id, [
      { permissionId: view._id, effect: "ALLOW", dataScope: "SOCIETY" },
    ]);
    mappings = await mappingService.getRolePermissions(customResult.entity._id);
    assert.equal(mappings.length, 1);
    await mappingService.replaceRolePermissions(denyResult.entity._id, [
      { permissionId: view._id, effect: "DENY", dataScope: "SOCIETY" },
    ]);
    const global = await assignmentService.createAssignment({
      userId: user._id,
      roleId: customResult.entity._id,
      scopeType: "GLOBAL",
      academicSession: "VERIFY-G",
    });
    assert(global.entity);
    const societyAssignment = await assignmentService.createAssignment({
      userId: user._id,
      roleId: denyResult.entity._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[0],
      academicSession: "VERIFY-D",
    });
    assert(societyAssignment.entity);
    await expectCode(
      () =>
        assignmentService.createAssignment({
          userId: user._id,
          roleId: denyResult.entity._id,
          scopeType: "SOCIETY",
          societyId: ids.societies[0],
          academicSession: "VERIFY-D",
        }),
      "ROLE_ASSIGNMENT_EXISTS"
    );
    let check = await auth.hasPermission({
      userId: user._id,
      permissionCode: "society.view",
      societyId: ids.societies[0],
    });
    assert.equal(check.allowed, false);
    check = await auth.hasPermission({
      userId: user._id,
      permissionCode: "society.view",
      societyId: ids.societies[1],
    });
    assert.equal(check.allowed, true);
    await Assignment.updateOne(
      { _id: global.entity._id },
      { $set: { status: "ENDED", isOngoing: false } }
    );
    const president = await Role.findOne({ code: "PRESIDENT" });
    await assignmentService.createAssignment({
      userId: user._id,
      roleId: president._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[0],
      academicSession: "VERIFY-P",
    });
    await assignmentService.createAssignment({
      userId: user._id,
      roleId: president._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[1],
      academicSession: "VERIFY-P",
    });
    const gs = await Role.findOne({ code: "GENERAL_SECRETARY" });
    await assignmentService.createAssignment({
      userId: studentUser._id,
      roleId: gs._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[0],
      academicSession: "VERIFY-GS",
    });
    await expectCode(
      () =>
        assignmentService.createAssignment({
          userId: studentUser._id,
          roleId: gs._id,
          scopeType: "SOCIETY",
          societyId: ids.societies[1],
          academicSession: "VERIFY-GS",
        }),
      "ROLE_CONCURRENT_SOCIETY_LIMIT_REACHED"
    );
    const lead = await Role.findOne({ code: "LEAD" }),
      member = await Role.findOne({ code: "MEMBER" });
    await assignmentService.createAssignment({
      userId: studentUser._id,
      roleId: lead._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[1],
      academicSession: "VERIFY-L",
    });
    await assignmentService.createAssignment({
      userId: studentUser._id,
      roleId: member._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[2],
      academicSession: "VERIFY-M",
    });
    await Assignment.updateMany(
      { userId: { $in:[user._id,studentUser._id] }, roleId: { $in: [president._id, gs._id] } },
      { $set: { status: "ENDED", isOngoing: false } },
    );
    const primary = await auth.resolvePrimaryDashboardRole(studentUser._id);
    assert.equal(primary.role.code, "LEAD");
    await Assignment.create({
      userId: studentUser._id,
      roleId: customResult.entity._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[2],
      academicSession: "VERIFY-EXPIRED",
      validUntil: new Date(Date.now() - 86400000),
      status: "ACTIVE",
      isOngoing: false,
    });
    check = await auth.hasPermission({
      userId: studentUser._id,
      permissionCode: "society.view",
      societyId: ids.societies[2],
    });
    assert.equal(check.allowed, false);
    await Assignment.updateOne(
      { userId: user._id, roleId: president._id, societyId: ids.societies[1] },
      { $set: { status: "ACTIVE", isOngoing: true } },
    );
    const capabilities = await auth.getUiCapabilities({
      userId: user._id,
      societyId: ids.societies[1],
    });
    assert(capabilities.permissionCodes.includes("society.view"));
    const protectedRole = await Role.findOne({ code: "SUPER_ADMIN" });
    await expectCode(
      () => roleService.updateStatus(protectedRole._id, "ARCHIVED"),
      "SYSTEM_ROLE_PROTECTED"
    );
    await Assignment.create({
      userId: user._id,
      roleId: protectedRole._id,
      scopeType: "GLOBAL",
      societyId: null,
      academicSession: "VERIFY-SA",
      status: "ACTIVE",
      isOngoing: true,
    });
    const effective = await auth.getEffectivePermissions({ userId: user._id });
    assert.equal(
      effective.permissions.length,
      await Permission.countDocuments({ status: "ACTIVE" })
    );
    console.log(
      JSON.stringify(
        {
          passed: 16,
          customRole: true,
          bulkReplacement: true,
          globalAndSocietyAssignments: true,
          duplicateConflict: true,
          concurrencyLimit: true,
          scopeIsolation: true,
          denyOverride: true,
          expiredIgnored: true,
          primaryRank: true,
          uiCapabilities: true,
          systemProtection: true,
          superAdminFullAccess: true,
        },
        null,
        2
      )
    );
  } finally {
    if (ids.users.length)
      await Assignment.deleteMany({ userId: { $in: ids.users } });
    if (ids.roles.length)
      await Mapping.deleteMany({ roleId: { $in: ids.roles } });
    if (ids.roles.length) await Role.deleteMany({ _id: { $in: ids.roles } });
    if (ids.societies.length)
      await Society.deleteMany({ _id: { $in: ids.societies } });
    if (ids.users.length) await User.deleteMany({ _id: { $in: ids.users } });
    await disconnectDatabase();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
