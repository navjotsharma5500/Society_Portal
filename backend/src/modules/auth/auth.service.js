const AppError = require("../../common/errors/AppError"),
  User = require("../users/user.model"),
  Student = require("../studentMaster/studentMaster.model"),
  Assignment = require("../userRoleAssignments/userRoleAssignment.model"),
  google = require("./googleIdentity.service"),
  sessions = require("./session.service"),
  authz = require("../authorization/authorization.service"),
  dashboardContexts = require("./dashboardContext.service"),
  events = require("../../common/events/domainEvent.service");
const performance = require("../../common/performance/performance");
const { AUTH_INTENTS, NEXT_ACTIONS } = require("./auth.constants");
const blocked = (user) => {
  if (user.status === "INACTIVE")
    throw new AppError("Account is inactive", 403, "ACCOUNT_INACTIVE");
  if (user.status === "SUSPENDED")
    throw new AppError("Account is suspended", 403, "ACCOUNT_SUSPENDED");
  if (!user.isLoginAllowed)
    throw new AppError(
      "Login access is disabled",
      403,
      "LOGIN_ACCESS_DISABLED"
    );
};
const resolveAuthNextAction = async ({ user, student }) => {
  if (
    !user ||
    ["INACTIVE", "SUSPENDED"].includes(user.status) ||
    !user.isLoginAllowed ||
    (student && !student.isLoginAllowed)
  )
    return NEXT_ACTIONS.ACCOUNT_BLOCKED;
  if (!student) return NEXT_ACTIONS.DASHBOARD;
  const Onboarding = require("../studentOnboarding/studentOnboarding.model");
  const onboarding = await Onboarding.findOne({ userId: user._id }).lean();
  if (onboarding) {
    if (onboarding.submittedAt) return NEXT_ACTIONS.DASHBOARD;
    if (
      onboarding.hasAcceptedPartialResult ||
      ["COMPLETED", "APPROVED", "LOCKED"].includes(onboarding.status)
    )
      return NEXT_ACTIONS.DASHBOARD;
    if ((onboarding.summary?.approvedClaims || 0) > 0)
      return NEXT_ACTIONS.PROFILE_PARTIALLY_VERIFIED;
    if (
      ["SUBMITTED", "UNDER_VERIFICATION", "PARTIALLY_VERIFIED"].includes(
        onboarding.status
      )
    )
      return NEXT_ACTIONS.PROFILE_VERIFICATION_PENDING;
    if (
      ["IN_PROGRESS", "CHANGES_REQUESTED", "FULLY_REJECTED"].includes(
        onboarding.status
      )
    )
      return NEXT_ACTIONS.PROFILE_ONBOARDING_RESUME;
  }
  if (student.profileStatus === "APPROVED") return NEXT_ACTIONS.DASHBOARD;
  if (student.profileStatus === "PENDING_VERIFICATION")
    return NEXT_ACTIONS.PROFILE_VERIFICATION_PENDING;
  if (student.profileStatus === "CHANGES_REQUESTED")
    return NEXT_ACTIONS.PROFILE_CHANGES_REQUESTED;
  if (student.profileStatus === "REJECTED")
    return NEXT_ACTIONS.PROFILE_REJECTED;
  if (student.signupStatus === "NOT_STARTED")
    return NEXT_ACTIONS.PROFILE_ONBOARDING;
  if (student.signupStatus === "STARTED")
    return NEXT_ACTIONS.PROFILE_ONBOARDING_RESUME;
  return NEXT_ACTIONS.PROFILE_ONBOARDING_RESUME;
};
const loadEligible = async (identity) => {
  const [user, subjectUser] = await Promise.all([
    User.findOne({ email: identity.email }),
    User.findOne({ googleSubject: identity.sub }),
  ]);
  if (!user && subjectUser)
    throw new AppError(
      "Google account does not match the registered email",
      403,
      "GOOGLE_ACCOUNT_MISMATCH"
    );
  if (!user)
    throw new AppError(
      "No registered account was found for this email",
      404,
      "ACCOUNT_NOT_REGISTERED"
    );
  if (subjectUser && String(subjectUser._id) !== String(user._id))
    throw new AppError(
      "Google identity is already linked to another account",
      409,
      "GOOGLE_SUBJECT_ALREADY_LINKED"
    );
  blocked(user);
  let student = null;
  if (user.accountType === "STUDENT") {
    if (!user.studentMasterId)
      throw new AppError(
        "Student master record is missing",
        403,
        "STUDENT_MASTER_NOT_FOUND"
      );
    student = await Student.findById(user.studentMasterId);
    if (!student)
      throw new AppError(
        "Student master record is missing",
        403,
        "STUDENT_MASTER_NOT_FOUND"
      );
    if (user.email !== identity.email || student.email !== identity.email)
      throw new AppError(
        "Google account does not match the registered email",
        403,
        "GOOGLE_ACCOUNT_MISMATCH"
      );
    if (!student.isLoginAllowed)
      throw new AppError(
        "Student login access is disabled",
        403,
        "LOGIN_ACCESS_DISABLED"
      );
    if (student.recordStatus !== "ACTIVE")
      throw new AppError(
        "Student record is inactive",
        403,
        "STUDENT_RECORD_INACTIVE"
      );
  } else if (user.email !== identity.email)
    throw new AppError(
      "Google account does not match the registered email",
      403,
      "GOOGLE_ACCOUNT_MISMATCH"
    );
  return { user, student };
};
const assertAndLinkSubject = async (user, identity, intent) => {
  const other = await User.findOne({
    googleSubject: identity.sub,
    _id: { $ne: user._id },
  });
  if (other)
    throw new AppError(
      "Google identity is already linked to another account",
      409,
      "GOOGLE_SUBJECT_ALREADY_LINKED"
    );
  if (user.googleSubject && user.googleSubject !== identity.sub)
    throw new AppError(
      "A different Google account is linked",
      403,
      "GOOGLE_ACCOUNT_MISMATCH"
    );
  if (!user.googleSubject) {
    if (![AUTH_INTENTS.SIGN_UP, AUTH_INTENTS.STAFF_SIGN_IN].includes(intent))
      throw new AppError(
        "Sign-up is required before sign-in",
        403,
        "SIGNUP_REQUIRED"
      );
    user.googleSubject = identity.sub;
    try {
      await user.save();
    } catch (error) {
      if (error?.code === 11000)
        throw new AppError(
          "Google identity is already linked to another account",
          409,
          "GOOGLE_SUBJECT_ALREADY_LINKED"
        );
      throw error;
    }
  }
};
const authenticateGoogle = async ({ idToken, intent, req }) => {
  let identity;
  try {
    identity = await google.verify(idToken);
    const { user, student } = await loadEligible(identity);
    let signupStarted = false;
    if (
      intent === AUTH_INTENTS.SIGN_IN &&
      student?.signupStatus === "NOT_STARTED"
    )
      throw new AppError(
        "Complete sign-up before signing in",
        403,
        "SIGNUP_REQUIRED"
      );
    await assertAndLinkSubject(user, identity, intent);
    if (
      intent === AUTH_INTENTS.SIGN_UP &&
      student?.signupStatus === "NOT_STARTED"
    ) {
      student.signupStatus = "STARTED";
      await student.save();
      signupStarted = true;
      events.publish("AUTH_SIGNUP_STARTED", {
        userId: user._id,
        studentMasterId: student._id,
      });
    }
    const nextAction = signupStarted
      ? NEXT_ACTIONS.PROFILE_ONBOARDING
      : await resolveAuthNextAction({ user, student });
    const issued = await sessions.createSession(user, req);
    events.publish("AUTH_LOGIN_SUCCEEDED", {
      userId: user._id,
      studentMasterId: student?._id,
      metadata: { intent, nextAction, sessionId: String(issued.session._id) },
    });
    return { user, student, nextAction, ...issued };
  } catch (error) {
    events.publish("AUTH_LOGIN_FAILED", {
      metadata: { intent, errorCode: error.code || "INTERNAL_SERVER_ERROR" },
    });
    throw error;
  }
};
const authenticateStaffGoogle = async ({ idToken, req }) => {
  let identity;
  const totalStartedAt = performance.now(), timings = {};
  try {
    let startedAt = performance.now();
    identity = await google.verify(idToken);
    timings.googleVerifyMs = Math.round((performance.now() - startedAt) * 10) / 10;
    startedAt = performance.now();
    const { user } = await loadEligible(identity);
    timings.userLookupMs = Math.round((performance.now() - startedAt) * 10) / 10;
    if (user.accountType === "STUDENT")
      throw new AppError("Use Student Access for this account", 403, "STAFF_ACCOUNT_REQUIRED");
    startedAt = performance.now();
    await assertAndLinkSubject(user, identity, AUTH_INTENTS.STAFF_SIGN_IN);
    timings.identityLinkMs = Math.round((performance.now() - startedAt) * 10) / 10;
    startedAt = performance.now();
    timings.contextsMs = Math.round((performance.now() - startedAt) * 10) / 10;
    startedAt = performance.now();
    const issued = await sessions.createSession(user, req);
    timings.sessionCreateMs = Math.round((performance.now() - startedAt) * 10) / 10;
    startedAt = performance.now();
    const state = await getMe(user._id, issued.session);
    timings.authStateMs = Math.round((performance.now() - startedAt) * 10) / 10;
    events.publish("AUTH_LOGIN_SUCCEEDED", {
      userId: user._id,
      metadata: {
        intent: AUTH_INTENTS.STAFF_SIGN_IN,
        nextAction: state.nextAction,
        sessionId: String(issued.session._id),
      },
    });
    const result = {
      ...issued,
      state: {
        ...state,
        availableDashboardContexts: state.availableDashboardContexts,
        dashboardContexts: state.dashboardContexts,
        nextAction: state.nextAction,
      },
    };
    performance.log("auth.staff-sign-in", { ...timings, totalMs: Math.round((performance.now() - totalStartedAt) * 10) / 10 });
    return result;
  } catch (error) {
    events.publish("AUTH_LOGIN_FAILED", {
      metadata: {
        intent: AUTH_INTENTS.STAFF_SIGN_IN,
        errorCode: error.code || "INTERNAL_SERVER_ERROR",
      },
    });
    throw error;
  }
};
const reconcileGoogleIdentity = async ({
  userId,
  expectedEmail,
  newGoogleSubject,
  actorId,
}) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  if (user.email !== String(expectedEmail).trim().toLowerCase())
    throw new AppError(
      "Registered email mismatch",
      409,
      "GOOGLE_ACCOUNT_MISMATCH"
    );
  if (
    newGoogleSubject &&
    (await User.exists({
      googleSubject: newGoogleSubject,
      _id: { $ne: userId },
    }))
  )
    throw new AppError(
      "Google identity is already linked",
      409,
      "GOOGLE_SUBJECT_ALREADY_LINKED"
    );
  user.googleSubject = newGoogleSubject || undefined;
  user.updatedBy = actorId;
  await user.save();
  await sessions.revokeAllForUser(userId, "IDENTITY_RECONCILED");
  return {
    id: user.id,
    email: user.email,
    googleIdentityLinked: Boolean(user.googleSubject),
  };
};
const resolveActiveSocietyContexts = async (userId) => {
  const Membership = require("../societyMemberships/societyMembership.model");
  const now = new Date();
  const rows = await Assignment.find({
    userId,
    scopeType: "SOCIETY",
    status: "ACTIVE",
    isOngoing: true,
    $and: [
      {
        $or: [
          { validFrom: null },
          { validFrom: { $exists: false } },
          { validFrom: { $lte: now } },
        ],
      },
      {
        $or: [
          { validUntil: null },
          { validUntil: { $exists: false } },
          { validUntil: { $gt: now } },
        ],
      },
    ],
  })
    .populate("roleId")
    .populate("societyId")
    .lean();
  const membershipRows = await Membership.find({
    userId,
    status: "ACTIVE",
    isOngoing: true,
  })
    .select("societyId roleId linkedUserRoleAssignmentId startDate endDate")
    .lean();
  const membershipByAssignment = new Map(
    membershipRows.map((m) => [String(m.linkedUserRoleAssignmentId), m])
  );
  const active = rows.filter((x) => {
    const membership = membershipByAssignment.get(String(x._id));
    return (
      membership &&
      membership.startDate <= now &&
      (!membership.endDate || membership.endDate > now) &&
      x.roleId?.status === "ACTIVE" &&
      x.societyId?.status === "ACTIVE" &&
      x.societyId?.isActive !== false
    );
  });
  const highestBySociety = new Map();
  for (const assignment of active) {
    const key = String(assignment.societyId._id), current = highestBySociety.get(key);
    if (!current || (assignment.roleId?.rank || 0) > (current.roleId?.rank || 0))
      highestBySociety.set(key, assignment);
  }
  return Promise.all(
    [...highestBySociety.values()].sort((a,b)=>a.societyId.name.localeCompare(b.societyId.name)||String(a._id).localeCompare(String(b._id))).map(async (a) => {
      const membership = membershipByAssignment.get(String(a._id));
      const effective = await authz.getEffectivePermissions({
        userId,
        societyId: a.societyId._id,
      });
      return {
        id: `${a.societyId._id}:${a.roleId._id}`,
        societyId: a.societyId._id,
        societyName: a.societyId.name,
        societyCode: a.societyId.code,
        roleId: a.roleId._id,
        roleCode: a.roleId.code,
        roleName: a.roleId.name,
        roleRank: a.roleId.rank,
        membershipId: membership._id,
        dashboardKey: a.roleId.dashboardKey,
        permissions: effective.permissions,
        uiCapabilities: await authz.getUiCapabilities({
          userId,
          societyId: a.societyId._id,
        }),
      };
    })
  );
};
const getMe = async (userId, session) => {
  const user = await User.findById(userId).select("-googleSubject").lean();
  const student = user?.studentMasterId
    ? await Student.findById(user.studentMasterId)
        .select("-metadata -createdBy -updatedBy")
        .lean()
    : null;
  const active = await Assignment.find({
    userId,
    ...require("../userRoleAssignments/userRoleAssignment.service").activeWindow(new Date()),
  })
    .select("-metadata -createdBy -updatedBy")
    .populate("roleId")
    .populate("societyId", "name code status isActive")
    .lean();
  const globalAssignments = active.filter(
    (x) => x.scopeType === "GLOBAL" && x.roleId?.status === "ACTIVE"
  );
  const availableDashboardContexts = user.accountType === "STUDENT"
    ? await dashboardContexts.resolveAvailableDashboardContexts(userId)
    : active.filter((a) => a.roleId?.status === "ACTIVE" && (a.scopeType === "GLOBAL" || (a.scopeType === "SOCIETY" && a.societyId?.status === "ACTIVE" && a.societyId?.isActive !== false))).sort((a, b) => (b.roleId?.rank || 0) - (a.roleId?.rank || 0)).map((a) => ({ id: String(a._id), assignmentId: a._id, type: a.scopeType, roleId: a.roleId._id, roleCode: a.roleId.code, roleName: a.roleId.name, rank: a.roleId.rank || 0, dashboardKey: a.roleId.dashboardKey || null, ...(a.scopeType === "SOCIETY" ? { societyId: a.societyId._id, societyName: a.societyId.name, societyCode: a.societyId.code } : {}), label: a.scopeType === "SOCIETY" ? `${a.societyId.name} — ${a.roleId.name}` : `${a.roleId.name} Console` }));
  const effective = await authz.getEffectivePermissions({ userId });
  const lifecycle = require("../membershipLifecycle/membershipLifecycle.service");
  const maximumActiveSocieties = user.accountType === "STUDENT" ? await require("../portalSettings/portalSetting.service").getValue("membership.max_active_societies_per_student") : 0;
  const activeSocietyCount = user.accountType === "STUDENT" ? await lifecycle.activeCount(userId) : 0;
  let nextAction =
    user.accountType === "STUDENT"
      ? await resolveAuthNextAction({ user, student })
      : NEXT_ACTIONS.STAFF_DASHBOARD;
  const activeSocietyContexts=user.accountType==="STUDENT"?await resolveActiveSocietyContexts(userId):[];
  if(user.accountType==="STUDENT"&&nextAction===NEXT_ACTIONS.DASHBOARD&&!activeSocietyContexts.length)nextAction=NEXT_ACTIONS.STUDENT_NO_ACTIVE_SOCIETY;
  if(user.accountType!=="STUDENT"&&!availableDashboardContexts.length)nextAction=NEXT_ACTIONS.STAFF_NO_WORKSPACE;
  const accessState =
    nextAction === NEXT_ACTIONS.DASHBOARD ? "STUDENT_DASHBOARD" : nextAction;
  return {
    user: {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      accountType: user.accountType,
      profilePictureUrl:
        user.profilePhotoUrl ||
        student?.profilePictureUrl ||
        user.profilePictureUrl ||
        null,
    },
    student,
    onboarding: {
      signupStatus: student?.signupStatus || null,
      profileStatus: student?.profileStatus || null,
      nextAction,
    },
    nextAction,
    primaryDashboardRole: (() => { const sorted = [...active].filter((a) => a.roleId?.status === "ACTIVE").sort((a,b)=>Number(b.isPrimary)-Number(a.isPrimary)||(b.roleId?.rank||0)-(a.roleId?.rank||0)||(a.scopeType===b.scopeType?0:a.scopeType==="GLOBAL"?-1:1)||new Date(b.validFrom||b.createdAt)-new Date(a.validFrom||a.createdAt)), assignment=sorted[0]; return assignment ? { assignmentId: assignment._id, role: assignment.roleId, dashboardKey: assignment.roleId.dashboardKey || null, scopeType: assignment.scopeType, societyId: assignment.societyId?._id || assignment.societyId || null } : null; })(),
    globalAssignments,
    societyAssignments: active.filter((x) => x.scopeType === "SOCIETY" && x.roleId?.status === "ACTIVE"),
    availableDashboardContexts,
    dashboardContexts: availableDashboardContexts,
    activeSocietyContexts,
    accessState,
    effectivePermissions: effective.permissions,
    globalUiCapabilities: (() => { const allowed = effective.permissions.filter((permission) => permission.effect === "ALLOW"), keys = (type) => allowed.filter((permission) => permission.permissionType === type && permission.uiKey).map((permission) => permission.uiKey); return { permissionCodes: allowed.map((permission) => permission.code), uiKeys: [...new Set(allowed.map((permission) => permission.uiKey).filter(Boolean))], routes: [...new Set(allowed.map((permission) => permission.route).filter(Boolean))], buttons: keys("BUTTON"), menus: keys("MENU"), fields: keys("FIELD") }; })(),
    membership: {
      activeSocietyCount,
      maximumActiveSocieties,
      remainingSlots: Math.max(0, maximumActiveSocieties - activeSocietyCount),
      joinSocietyAvailable:
        user.accountType === "STUDENT" &&
        [NEXT_ACTIONS.DASHBOARD, NEXT_ACTIONS.STUDENT_NO_ACTIVE_SOCIETY].includes(nextAction) &&
        activeSocietyCount < maximumActiveSocieties,
      joinSocietyDisabledReason:
        activeSocietyCount >= maximumActiveSocieties
          ? "MAX_ACTIVE_SOCIETIES_REACHED"
          : null,
    },
    session: {
      id: session._id,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
    },
  };
};
const getSocietyContext = async (userId, societyId) => {
  const contexts = await resolveActiveSocietyContexts(userId),
    context = contexts.filter((x) => String(x.societyId) === String(societyId));
  if (!context.length)
    throw new AppError(
      "Society context is not available",
      403,
      "SOCIETY_CONTEXT_NOT_AVAILABLE"
    );
  const assignments = await Assignment.find({
    userId,
    societyId,
    status: "ACTIVE",
    isOngoing: true,
  })
    .select("-metadata -createdBy -updatedBy")
    .populate("roleId")
    .lean();
  assignments.sort((a, b) => (b.roleId?.rank || 0) - (a.roleId?.rank || 0));
  const effective = await authz.getEffectivePermissions({ userId, societyId });
  return {
    society: {
      id: context[0].societyId,
      name: context[0].societyName,
      code: context[0].societyCode,
    },
    assignments,
    primarySocietyRole: assignments[0]?.roleId || null,
    permissions: effective.permissions,
    uiCapabilities: await authz.getUiCapabilities({ userId, societyId }),
  };
};
module.exports = {
  authenticateGoogle,
  authenticateStaffGoogle,
  resolveAvailableDashboardContexts: dashboardContexts.resolveAvailableDashboardContexts,
  resolveAuthNextAction,
  resolveActiveSocietyContexts,
  getMe,
  getSocietyContext,
  reconcileGoogleIdentity,
};
