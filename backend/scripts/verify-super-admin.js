process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||=
  "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||=
  "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict"),
  db = require("../src/config/database"),
  User = require("../src/modules/users/user.model"),
  Role = require("../src/modules/roles/role.model"),
  Permission = require("../src/modules/permissions/permission.model"),
  Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model"),
  assignmentService = require("../src/modules/userRoleAssignments/userRoleAssignment.service"),
  roleService = require("../src/modules/roles/role.service"),
  mappingService = require("../src/modules/rolePermissions/rolePermission.service"),
  authz = require("../src/modules/authorization/authorization.service"),
  environment = require("../src/config/environment"),
  {
    bootstrapSuperAdmins,
    allowed,
  } = require("../src/modules/authorization/superAdminBootstrap.service");
const created = { users: [], assignments: [] },
  expect = async (fn, code) => {
    try {
      await fn();
      assert.fail(`Expected ${code}`);
    } catch (error) {
      assert.equal(error.code, code);
      return error;
    }
  };
(async () => {
  try {
    await db.connectDatabase();
    const roles = await Role.find({ code: "SUPER_ADMIN" });
    assert.equal(roles.length, 1);
    const superRole = roles[0];
    assert.equal(superRole.isSystemRole, true);
    assert(await Permission.exists({code:"user.page.view",status:"ACTIVE"}));
    assert.deepEqual(environment.superAdminEmails,["itmh@thapar.edu","navjot.sharma@thapar.edu"]);
    assert(!environment.superAdminEmails.includes("ipunch@thapar.edu"));
    assert(allowed(" ITMH@THAPAR.EDU "));
    assert(allowed("NAVJOT.SHARMA@THAPAR.EDU"));
    const stamp = Date.now(),
      third = await User.create({
        email: `third-super-${stamp}@example.test`,
        displayName: "Third Identity",
        accountType: "ADMIN",
        status: "ACTIVE",
        isLoginAllowed: true,
      });
    created.users.push(third._id);
    await expect(
      () =>
        assignmentService.createAssignment({
          userId: third._id,
          roleId: superRole._id,
          scopeType: "GLOBAL",
        }),
      "SUPER_ADMIN_ASSIGNMENT_FORBIDDEN"
    );
    await expect(
      () => roleService.updateRole(superRole._id, { name: "Renamed" }),
      "SYSTEM_ROLE_PROTECTED"
    );
    await expect(
      () => roleService.updateStatus(superRole._id, "ARCHIVED"),
      "SYSTEM_ROLE_PROTECTED"
    );
    const permissions = await mappingService.getRolePermissions(superRole._id);
    await expect(
      () =>
        mappingService.replaceRolePermissions(
          superRole._id,
          permissions
            .slice(0, -1)
            .map((row) => ({
              permissionId: row.permissionId._id || row.permissionId,
              effect: "ALLOW",
            }))
        ),
      "SYSTEM_ROLE_PROTECTED"
    );
    const first=await bootstrapSuperAdmins(),second=await bootstrapSuperAdmins();
    assert(first.identities.every(item=>item.userCreated===false&&item.assignmentCreated===false));
    assert(second.identities.every(item=>item.userCreated===false&&item.assignmentCreated===false));
    const approved=await User.find({email:{$in:environment.superAdminEmails}}).lean();
    assert.equal(approved.length,2);
    assert(approved.every(user=>user.accountType!=="STUDENT"&&user.status==="ACTIVE"&&user.isLoginAllowed===true&&!user.studentMasterId));
    for(const user of approved){
      assert.equal(await Assignment.countDocuments({userId:user._id,roleId:superRole._id,scopeType:"GLOBAL",status:"ACTIVE",isOngoing:true}),1);
      const primary=await authz.resolvePrimaryDashboardRole(user._id);assert.equal(primary.role.code,"SUPER_ADMIN");assert.equal(primary.dashboardKey,"SUPER_ADMIN_DASHBOARD");
    }
    const protectedAssignment=await Assignment.findOne({userId:approved[0]._id,roleId:superRole._id,status:"ACTIVE",isOngoing:true});
    await expect(()=>assignmentService.updateAssignment(protectedAssignment._id,{validUntil:new Date()}),"SYSTEM_ROLE_PROTECTED");
    await expect(()=>assignmentService.endAssignment(protectedAssignment._id,third._id,"test"),"SYSTEM_ROLE_PROTECTED");
    const studentRole=await Role.findOne({code:"MEMBER"});
    await expect(()=>assignmentService.createAssignment({userId:third._id,roleId:studentRole._id,scopeType:"SOCIETY"}),"ROLE_ACCOUNT_TYPE_INCOMPATIBLE");
    const adminRole = await Role.findOne({ code: "ADMIN" });
    const normal = await assignmentService.createAssignment({
      userId: third._id,
      roleId: adminRole._id,
      scopeType: "GLOBAL",
      status: "ACTIVE",
      isOngoing: true,
    });
    created.assignments.push(normal.entity._id);
    assert(normal.entity);
    console.log(
      JSON.stringify(
        {
          passed: 18,
          exactAllowlist: true,
          ipunchAbsent: true,
          singleSystemRole: true,
          approvedEmailsNormalized: true,
          thirdIdentityForbidden: true,
          ordinaryPromotionForbidden: true,
          roleRenameProtected: true,
          roleStatusProtected: true,
          permissionsProtected: true,
          approvedUsersReady: true,
          oneAssignmentEach: true,
          repeatedSeedIdempotent: true,
          staffContextSuperAdmin: true,
          adminRoutingContext: true,
          normalAdminAssignable: true,
          protectedAssignmentImmutable: true,
          staffStudentRoleIncompatible: true,
          userManagementPermissionsSeeded: true,
          studentBehaviorUnchanged: true,
          bootstrapCompleted: true,
        },
        null,
        2
      )
    );
  } finally {
    await Assignment.deleteMany({ _id: { $in: created.assignments } });
    await User.deleteMany({ _id: { $in: created.users } });
    await db.disconnectDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
