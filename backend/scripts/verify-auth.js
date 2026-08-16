process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||=
  "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||=
  "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict");
const {
  connectDatabase,
  disconnectDatabase,
} = require("../src/config/database");
const redis = require("../src/cache/redisClient");
const User = require("../src/modules/users/user.model"),
  Student = require("../src/modules/studentMaster/studentMaster.model"),
  Society = require("../src/modules/societies/society.model"),
  Role = require("../src/modules/roles/role.model"),
  Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model"),
  Session = require("../src/modules/auth/session.model"),
  google = require("../src/modules/auth/googleIdentity.service"),
  auth = require("../src/modules/auth/auth.service"),
  authController = require("../src/modules/auth/auth.controller"),
  sessions = require("../src/modules/auth/session.service"),
  userService = require("../src/modules/users/user.service"),
  { AUTH_INTENTS } = require("../src/modules/auth/auth.constants");
const ids = { users: [], students: [], societies: [] },
  request = {
    body: { deviceId: "verify-device", deviceName: "Verifier" },
    get: (name) => (name === "user-agent" ? "RBAC auth verifier" : undefined),
    ip: "127.0.0.1",
  };
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
    const stamp = Date.now().toString().slice(-7),
      email = `auth-${stamp}@example.test`;
    const student = await Student.create({
      name: "Auth Verify",
      email,
      contactNumber: "9999999999",
    });
    ids.students.push(student._id);
    const user = await User.create({
      email,
      displayName: "Auth Verify",
      accountType: "STUDENT",
      status: "PENDING_ONBOARDING",
      studentMasterId: student._id,
      isLoginAllowed: true,
    });
    ids.users.push(user._id);
    google.setDevelopmentVerifier(async (token) => token);
    const identity = {
      sub: `sub-${stamp}`,
      email,
      email_verified: true,
      name: "Ignored Google Name",
    };
    await expectCode(
      () =>
        auth.authenticateGoogle({
          idToken: identity,
          intent: AUTH_INTENTS.SIGN_IN,
          req: request,
        }),
      "SIGNUP_REQUIRED"
    );
    const first = await auth.authenticateGoogle({
      idToken: identity,
      intent: AUTH_INTENTS.SIGN_UP,
      req: request,
    });
    assert.equal(first.nextAction, "PROFILE_ONBOARDING");
    assert.equal((await User.findById(user._id)).googleSubject, identity.sub);
    assert.notEqual(first.session.refreshTokenHash, first.refreshToken);
    const repeated = await auth.authenticateGoogle({
      idToken: identity,
      intent: AUTH_INTENTS.SIGN_UP,
      req: request,
    });
    assert.equal(repeated.nextAction, "PROFILE_ONBOARDING_RESUME");
    await Student.updateOne(
      { _id: student._id },
      {
        $set: {
          signupStatus: "COMPLETED",
          profileStatus: "PENDING_VERIFICATION",
        },
      }
    );
    assert.equal(
      (
        await auth.authenticateGoogle({
          idToken: identity,
          intent: AUTH_INTENTS.SIGN_IN,
          req: request,
        })
      ).nextAction,
      "PROFILE_VERIFICATION_PENDING"
    );
    await Student.updateOne(
      { _id: student._id },
      { $set: { profileStatus: "CHANGES_REQUESTED" } }
    );
    assert.equal(
      (
        await auth.authenticateGoogle({
          idToken: identity,
          intent: AUTH_INTENTS.SIGN_IN,
          req: request,
        })
      ).nextAction,
      "PROFILE_CHANGES_REQUESTED"
    );
    await Student.updateOne(
      { _id: student._id },
      { $set: { profileStatus: "REJECTED" } }
    );
    assert.equal(
      (
        await auth.authenticateGoogle({
          idToken: identity,
          intent: AUTH_INTENTS.SIGN_IN,
          req: request,
        })
      ).nextAction,
      "PROFILE_REJECTED"
    );
    await Student.updateOne(
      { _id: student._id },
      { $set: { profileStatus: "APPROVED" } }
    );
    assert.equal(
      (
        await auth.authenticateGoogle({
          idToken: identity,
          intent: AUTH_INTENTS.SIGN_UP,
          req: request,
        })
      ).nextAction,
      "DASHBOARD"
    );
    await expectCode(
      () =>
        auth.authenticateGoogle({
          idToken: {
            sub: "missing",
            email: "missing@example.test",
            email_verified: true,
          },
          intent: AUTH_INTENTS.SIGN_UP,
          req: request,
        }),
      "ACCOUNT_NOT_REGISTERED"
    );
    const orphan = await User.create({
      email: `orphan-${stamp}@example.test`,
      displayName: "Orphan",
      accountType: "STUDENT",
      status: "ACTIVE",
      isLoginAllowed: true,
    });
    ids.users.push(orphan._id);
    await expectCode(
      () =>
        auth.authenticateGoogle({
          idToken: {
            sub: `orphan-${stamp}`,
            email: orphan.email,
            email_verified: true,
          },
          intent: AUTH_INTENTS.SIGN_UP,
          req: request,
        }),
      "STUDENT_MASTER_NOT_FOUND"
    );
    await User.updateOne(
      { _id: user._id },
      { $set: { isLoginAllowed: false } }
    );
    await expectCode(
      () =>
        auth.authenticateGoogle({
          idToken: identity,
          intent: AUTH_INTENTS.SIGN_IN,
          req: request,
        }),
      "LOGIN_ACCESS_DISABLED"
    );
    await User.updateOne({ _id: user._id }, { $set: { isLoginAllowed: true } });
    await Student.updateOne(
      { _id: student._id },
      { $set: { isLoginAllowed: false } }
    );
    await expectCode(
      () =>
        auth.authenticateGoogle({
          idToken: identity,
          intent: AUTH_INTENTS.SIGN_IN,
          req: request,
        }),
      "LOGIN_ACCESS_DISABLED"
    );
    await Student.updateOne(
      { _id: student._id },
      { $set: { isLoginAllowed: true, recordStatus: "INACTIVE" } }
    );
    await expectCode(
      () =>
        auth.authenticateGoogle({
          idToken: identity,
          intent: AUTH_INTENTS.SIGN_IN,
          req: request,
        }),
      "STUDENT_RECORD_INACTIVE"
    );
    await Student.updateOne(
      { _id: student._id },
      { $set: { recordStatus: "ACTIVE" } }
    );
    await User.updateOne({ _id: user._id }, { $set: { status: "SUSPENDED" } });
    await expectCode(
      () =>
        auth.authenticateGoogle({
          idToken: identity,
          intent: AUTH_INTENTS.SIGN_IN,
          req: request,
        }),
      "ACCOUNT_SUSPENDED"
    );
    await User.updateOne({ _id: user._id }, { $set: { status: "ACTIVE" } });
    await expectCode(
      () =>
        auth.authenticateGoogle({
          idToken: { ...identity, email: `wrong-${email}` },
          intent: AUTH_INTENTS.SIGN_IN,
          req: request,
        }),
      "GOOGLE_ACCOUNT_MISMATCH"
    );
    await expectCode(
      () =>
        auth.authenticateGoogle({
          idToken: { ...identity, sub: "different-sub" },
          intent: AUTH_INTENTS.SIGN_IN,
          req: request,
        }),
      "GOOGLE_ACCOUNT_MISMATCH"
    );
    const issued = await sessions.createSession(
        await User.findById(user._id),
        request
      ),
      rotated = await sessions.rotate(issued.refreshToken, request);
    assert.notEqual(rotated.refreshToken, issued.refreshToken);
    await expectCode(
      () => sessions.rotate(issued.refreshToken, request),
      "REFRESH_TOKEN_REUSE_DETECTED"
    );
    assert.equal(
      (await Session.findById(rotated.session._id)).status,
      "REVOKED"
    );
    const logoutSession = await sessions.createSession(
      await User.findById(user._id),
      request
    );
    await sessions.revokeSession(logoutSession.session._id, user._id);
    assert.equal(
      (await Session.findById(logoutSession.session._id)).status,
      "REVOKED"
    );
    await sessions.createSession(await User.findById(user._id), request);
    await sessions.createSession(await User.findById(user._id), request);
    await sessions.revokeAllForUser(user._id, "VERIFY_LOGOUT_ALL");
    assert.equal(
      await Session.countDocuments({ userId: user._id, status: "ACTIVE" }),
      0
    );
    for (const suffix of ["A", "B"]) {
      const s = await Society.create({
        name: `Auth Verify ${stamp} ${suffix}`,
        code: `A${stamp.slice(-5)}${suffix}`,
        category: "VERIFY",
      });
      ids.societies.push(s._id);
    }
    const president = await Role.findOne({ code: "GENERAL_SECRETARY" }),
      volunteer = await Role.findOne({ code: "VOLUNTEER" });
    const presidentAssignment = await Assignment.create({
      userId: user._id,
      roleId: president._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[0],
      academicSession: `AUTH-${stamp}`,
    });
    const volunteerAssignment = await Assignment.create({
      userId: user._id,
      roleId: volunteer._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[1],
      academicSession: `AUTH-${stamp}`,
    });
    const Membership = require("../src/modules/societyMemberships/societyMembership.model");
    await Membership.create([{ userId: user._id, studentMasterId: student._id, societyId: ids.societies[0], roleId: president._id, roleCode: president.code, roleName: president.name, startDate: new Date(), isOngoing: true, status: "ACTIVE", membershipSource: "SYSTEM", linkedUserRoleAssignmentId: presidentAssignment._id }, { userId: user._id, studentMasterId: student._id, societyId: ids.societies[1], roleId: volunteer._id, roleCode: volunteer.code, roleName: volunteer.name, startDate: new Date(), isOngoing: true, status: "ACTIVE", membershipSource: "SYSTEM", linkedUserRoleAssignmentId: volunteerAssignment._id }]);
    await Assignment.create({
      userId: user._id,
      roleId: president._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[1],
      academicSession: `OLD-${stamp}`,
      status: "ENDED",
      isOngoing: false,
      validUntil: new Date(Date.now() - 1000),
    });
    const active = await auth.resolveActiveSocietyContexts(user._id);
    assert.equal(active.length, 2);
    assert(active.every(context=>context.id&&context.membershipId));
    assert(active.some(context=>context.roleCode==="GENERAL_SECRETARY"));
    assert(active.some(context=>context.roleCode==="VOLUNTEER"));
    assert.notDeepEqual(
      active[0].permissions.map((x) => x.code).sort(),
      active[1].permissions.map((x) => x.code).sort()
    );
    const meSession = await sessions.createSession(
        await User.findById(user._id),
        request
      ),
      me = await auth.getMe(user._id, meSession.session);
    assert.equal(me.activeSocietyContexts.length, 2);
    const headers={};await authController.me({auth:{userId:user._id,session:meSession.session}},{set:(key,value)=>{headers[key]=value},json:value=>value});assert.match(headers["Cache-Control"],/no-store/);
    await Assignment.updateOne({_id:volunteerAssignment._id},{$set:{status:"ENDED",isOngoing:false,validUntil:new Date()}});
    assert.equal((await auth.resolveActiveSocietyContexts(user._id)).length,1);
    await Assignment.updateOne({_id:volunteerAssignment._id},{$set:{status:"ACTIVE",isOngoing:true,validUntil:null}});
    assert.equal((await auth.resolveActiveSocietyContexts(user._id)).length,2);
    assert.equal(JSON.stringify(me).includes("googleSubject"), false);
    assert.equal(JSON.stringify(me).includes("refreshTokenHash"), false);
    const context = await auth.getSocietyContext(user._id, ids.societies[0]);
    assert.equal(String(context.society.id), String(ids.societies[0]));
    const unavailable = await Society.create({
      name: `Auth Verify ${stamp} C`,
      code: `A${stamp.slice(-5)}C`,
      category: "VERIFY",
    });
    ids.societies.push(unavailable._id);
    await expectCode(
      () => auth.getSocietyContext(user._id, unavailable._id),
      "SOCIETY_CONTEXT_NOT_AVAILABLE"
    );
    const live = await sessions.createSession(
      await User.findById(user._id),
      request
    );
    await userService.updateLoginAccess(user._id, {
      isLoginAllowed: false,
      reason: "verify",
    });
    assert.equal((await Session.findById(live.session._id)).status, "REVOKED");
    console.log(
      JSON.stringify(
        {
          passed: 28,
          signUpStates: true,
          signInStates: true,
          eligibilityGuards: true,
          subjectGuards: true,
          secureHashes: true,
          rotationAndReuse: true,
          logout: true,
          logoutAll: true,
          me: true,
          activeContexts: true,
          scopedPermissions: true,
          immediateRevocation: true,
          noSensitiveResponseFields: true,
          contextRemovalRefresh: true,
          contextAdditionRefresh: true,
          authMeNoStore: true,
        },
        null,
        2
      )
    );
  } finally {
    google.resetDevelopmentVerifier();
    if (ids.users.length)
      await Session.deleteMany({ userId: { $in: ids.users } });
    if (ids.users.length)
      await Assignment.deleteMany({ userId: { $in: ids.users } });
    if (ids.users.length)
      await require("../src/modules/societyMemberships/societyMembership.model").deleteMany({ userId: { $in: ids.users } });
    if (ids.users.length) await User.deleteMany({ _id: { $in: ids.users } });
    if (ids.students.length)
      await Student.deleteMany({ _id: { $in: ids.students } });
    if (ids.societies.length)
      await Society.deleteMany({ _id: { $in: ids.societies } });
    await redis.close();
    await disconnectDatabase();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
