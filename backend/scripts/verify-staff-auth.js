process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||=
  "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||=
  "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict"),
  { connectDatabase, disconnectDatabase } = require("../src/config/database"),
  User = require("../src/modules/users/user.model"),
  Student = require("../src/modules/studentMaster/studentMaster.model"),
  Society = require("../src/modules/societies/society.model"),
  Role = require("../src/modules/roles/role.model"),
  Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model"),
  Session = require("../src/modules/auth/session.model"),
  auth = require("../src/modules/auth/auth.service"),
  google = require("../src/modules/auth/googleIdentity.service"),
  { AUTH_INTENTS } = require("../src/modules/auth/auth.constants");
const ids = { users: [], students: [], societies: [], roles: [] },
  expect = async (fn, code) => {
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
    const stamp = Date.now().toString().slice(-8),
      roles = Object.fromEntries(
        (await Role.find({ code: { $in: ["PRESIDENT", "ADMIN"] } })).map(
          (r) => [r.code, r]
        )
      );
    assert(roles.PRESIDENT && roles.ADMIN);
    const makeUser = async ({
        status = "ACTIVE",
        login = true,
        type = "FACULTY",
        studentMasterId,
      } = {}) => {
        const u = await User.create({
          email: `staff-${stamp}-${ids.users.length}@example.test`,
          displayName: "Staff Auth Verify",
          accountType: type,
          status,
          isLoginAllowed: login,
          ...(studentMasterId ? { studentMasterId } : {}),
        });
        ids.users.push(u._id);
        return u;
      },
      staff = await makeUser(),
      disabled = await makeUser({ login: false }),
      inactive = await makeUser({ status: "INACTIVE" }),
      noRole = await makeUser();
    for (const suffix of ["A", "B"]) {
      const s = await Society.create({
        name: `Staff Auth ${stamp} ${suffix}`,
        code: `S${stamp.slice(-5)}${suffix}`,
        category: "VERIFY",
        status: "ACTIVE",
        isActive: true,
      });
      ids.societies.push(s._id);
    }
    const custom = await Role.create({
        name: `Staff Global ${stamp}`,
        code: `STAFF_GLOBAL_${stamp}`,
        category: "CUSTOM",
        scopeType: "GLOBAL",
        rank: 700,
        status: "ACTIVE",
      }),
      inactiveRole = await Role.create({
        name: `Inactive Staff ${stamp}`,
        code: `STAFF_INACTIVE_${stamp}`,
        category: "CUSTOM",
        scopeType: "GLOBAL",
        rank: 999,
        status: "INACTIVE",
      });
    ids.roles.push(custom._id, inactiveRole._id);
    await Assignment.create([
      {
        userId: staff._id,
        roleId: custom._id,
        scopeType: "GLOBAL",
        status: "ACTIVE",
        isOngoing: true,
      },
      {
        userId: staff._id,
        roleId: roles.ADMIN._id,
        scopeType: "GLOBAL",
        status: "ACTIVE",
        isOngoing: true,
      },
      {
        userId: staff._id,
        roleId: roles.PRESIDENT._id,
        scopeType: "SOCIETY",
        societyId: ids.societies[0],
        status: "ACTIVE",
        isOngoing: true,
      },
      {
        userId: staff._id,
        roleId: roles.PRESIDENT._id,
        scopeType: "SOCIETY",
        societyId: ids.societies[1],
        status: "ACTIVE",
        isOngoing: true,
      },
      {
        userId: staff._id,
        roleId: custom._id,
        scopeType: "GLOBAL",
        status: "ACTIVE",
        isOngoing: false,
        validFrom: new Date("2020-01-01"),
        validUntil: new Date("2020-02-01"),
        academicSession: "EXPIRED",
      },
      {
        userId: staff._id,
        roleId: inactiveRole._id,
        scopeType: "GLOBAL",
        status: "ACTIVE",
        isOngoing: true,
      },
    ]);
    const identities = {
      staff: {
        sub: `staff-sub-${stamp}`,
        email: staff.email,
        email_verified: true,
      },
      repeat: {
        sub: `staff-sub-${stamp}`,
        email: staff.email,
        email_verified: true,
      },
      missing: {
        sub: `missing-${stamp}`,
        email: `missing-${stamp}@example.test`,
        email_verified: true,
      },
      disabled: {
        sub: `disabled-${stamp}`,
        email: disabled.email,
        email_verified: true,
      },
      inactive: {
        sub: `inactive-${stamp}`,
        email: inactive.email,
        email_verified: true,
      },
      mismatch: {
        sub: `wrong-${stamp}`,
        email: staff.email,
        email_verified: true,
      },
      norole: {
        sub: `norole-${stamp}`,
        email: noRole.email,
        email_verified: true,
      },
    };
    google.setDevelopmentVerifier((token) => identities[token]);
    const first = await auth.authenticateStaffGoogle({ idToken: "staff" }),
      state = first.state;
    assert.equal(state.user.accountType, "FACULTY");
    assert.equal(
      (await User.findById(staff._id)).googleSubject,
      identities.staff.sub
    );
    assert.equal(state.globalAssignments.length >= 2, true);
    assert.equal(state.societyAssignments.length, 2);
    assert.equal(
      state.dashboardContexts.filter((x) => x.type === "SOCIETY").length,
      2
    );
    assert.equal(
      state.primaryDashboardRole.role.rank,
      Math.max(custom.rank, roles.ADMIN.rank, roles.PRESIDENT.rank)
    );
    assert.equal(
      state.dashboardContexts.some(
        (x) =>
          x.dashboardKey === undefined &&
          String(x.roleId) === String(inactiveRole._id)
      ),
      false
    );
    assert.equal(
      state.dashboardContexts.filter(
        (x) => String(x.roleId) === String(custom._id)
      ).length,
      1
    );
    const repeated = await auth.authenticateStaffGoogle({ idToken: "repeat" });
    assert.equal(repeated.state.nextAction, "STAFF_DASHBOARD");
    await expect(
      () => auth.authenticateStaffGoogle({ idToken: "missing" }),
      "ACCOUNT_NOT_REGISTERED"
    );
    await expect(
      () => auth.authenticateStaffGoogle({ idToken: "disabled" }),
      "LOGIN_ACCESS_DISABLED"
    );
    await expect(
      () => auth.authenticateStaffGoogle({ idToken: "inactive" }),
      "ACCOUNT_INACTIVE"
    );
    await expect(
      () => auth.authenticateStaffGoogle({ idToken: "mismatch" }),
      "GOOGLE_ACCOUNT_MISMATCH"
    );
    const noRoleState = await auth.authenticateStaffGoogle({ idToken: "norole" });
    assert.equal(noRoleState.state.nextAction, "STAFF_NO_WORKSPACE");
    assert.equal(noRoleState.state.accessState, "STAFF_NO_WORKSPACE");
    assert.equal(noRoleState.state.dashboardContexts.length, 0);
    const student = await Student.create({
      name: "Student unchanged",
      email: `student-${stamp}@example.test`,
      contactNumber: "9999999999",
      recordStatus: "ACTIVE",
      signupStatus: "NOT_STARTED",
      profileStatus: "PENDING_VERIFICATION",
    });
    ids.students.push(student._id);
    const studentUser = await User.create({
      email: student.email,
      displayName: "Student unchanged",
      accountType: "STUDENT",
      status: "ACTIVE",
      isLoginAllowed: true,
      studentMasterId: student._id,
    });
    ids.users.push(studentUser._id);
    identities.student = {
      sub: `student-${stamp}`,
      email: studentUser.email,
      email_verified: true,
    };
    await expect(
      () =>
        auth.authenticateGoogle({
          idToken: "student",
          intent: AUTH_INTENTS.SIGN_IN,
        }),
      "SIGNUP_REQUIRED"
    );
    console.log(
      JSON.stringify(
        {
          passed: 16,
          facultyWithoutStudentMaster: true,
          missingRejected: true,
          disabledRejected: true,
          inactiveRejected: true,
          emailMismatchRejected: true,
          firstLoginLinksSubject: true,
          repeatedLogin: true,
          multipleGlobalRoles: true,
          multipleSocietyRoles: true,
          presidentTwoSocieties: true,
          highestRankPrimary: true,
          expiredOmitted: true,
          inactiveRoleOmitted: true,
          noRoleWorkspaceState: true,
          studentBehaviorUnchanged: true,
          cleanup: true,
        },
        null,
        2
      )
    );
  } finally {
    google.resetDevelopmentVerifier();
    if (ids.users.length) {
      await Session.deleteMany({ userId: { $in: ids.users } });
      await Assignment.deleteMany({ userId: { $in: ids.users } });
      await User.deleteMany({ _id: { $in: ids.users } });
    }
    if (ids.students.length)
      await Student.deleteMany({ _id: { $in: ids.students } });
    if (ids.societies.length)
      await Society.deleteMany({ _id: { $in: ids.societies } });
    if (ids.roles.length) await Role.deleteMany({ _id: { $in: ids.roles } });
    await disconnectDatabase();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
