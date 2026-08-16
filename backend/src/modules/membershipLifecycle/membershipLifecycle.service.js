const mongoose = require("mongoose"),
  AppError = require("../../common/errors/AppError"),
  Membership = require("../societyMemberships/societyMembership.model"),
  Request = require("../membershipRequests/membershipRequest.model"),
  Assignment = require("../userRoleAssignments/userRoleAssignment.model"),
  Role = require("../roles/role.model"),
  Society = require("../societies/society.model"),
  User = require("../users/user.model"),
  Student = require("../studentMaster/studentMaster.model"),
  Onboarding = require("../studentOnboarding/studentOnboarding.model"),
  assignments = require("../userRoleAssignments/userRoleAssignment.service"),
  settings = require("../portalSettings/portalSetting.service"),
  authz = require("../authorization/authorization.service"),
  events = require("../../common/events/domainEvent.service");
const fail = (m, s, c) => {
    throw new AppError(m, s, c);
  },
  activeCount = (userId) =>
    Membership.countDocuments({ userId, status: "ACTIVE", isOngoing: true });
const resolveJoinSocietyEligibility = async ({ userId, targetSocietyId }) => {
  const [user, society, count, max, pending, member, onboarding] =
    await Promise.all([
      User.findById(userId).lean(),
      Society.findById(targetSocietyId).lean(),
      activeCount(userId),
      settings.getValue("membership.max_active_societies_per_student"),
      Request.exists({
        userId,
        societyId: targetSocietyId,
        status: { $in: ["SUBMITTED", "PENDING", "CLARIFICATION_REQUESTED"] },
      }),
      Membership.exists({
        userId,
        societyId: targetSocietyId,
        status: "ACTIVE",
        isOngoing: true,
      }),
      Onboarding.findOne({ userId }).lean(),
    ]);
  const ready =
    !user || user.accountType !== "STUDENT"
      ? false
      : Boolean(
          onboarding?.hasAcceptedPartialResult ||
            [
              "IN_PROGRESS",
              "CHANGES_REQUESTED",
              "COMPLETED",
              "APPROVED",
              "LOCKED",
            ].includes(onboarding?.status)
        );
  let reason = "ELIGIBLE";
  if (
    !user ||
    !["ACTIVE", "PENDING_ONBOARDING"].includes(user.status) ||
    !user.isLoginAllowed
  )
    reason = "USER_NOT_ELIGIBLE";
  else if (!ready) reason = "ONBOARDING_NOT_READY";
  else if (
    !society ||
    society.status !== "ACTIVE" ||
    society.isActive === false
  )
    reason = "TARGET_SOCIETY_INACTIVE";
  else if (member) reason = "ALREADY_ACTIVE_MEMBER";
  else if (pending) reason = "MEMBERSHIP_REQUEST_PENDING";
  else if (count >= max) reason = "MAX_ACTIVE_SOCIETIES_REACHED";
  return {
    eligible: reason === "ELIGIBLE",
    reason,
    activeSocietyCount: count,
    maximumActiveSocieties: max,
    remainingSlots: Math.max(0, max - count),
    alreadyMember: Boolean(member),
    pendingRequestExists: Boolean(pending),
    onboardingReady: ready,
    targetSocietyActive: Boolean(
      society && society.status === "ACTIVE" && society.isActive !== false
    ),
  };
};
const createAssignment = async ({
  userId,
  roleId,
  societyId,
  academicSession,
  startDate,
  source,
  metadata,
}) => {
  try {
    return (
      await assignments.createAssignment({
        userId,
        roleId,
        scopeType: "SOCIETY",
        societyId,
        academicSession: academicSession || null,
        validFrom: startDate || new Date(),
        isOngoing: true,
        status: "ACTIVE",
        assignmentSource:
          source === "ONBOARDING_APPROVAL" ? "PROFILE_APPROVAL" : "SUPER_ADMIN",
        metadata,
      })
    ).entity;
  } catch (e) {
    if (e.code !== "ROLE_ASSIGNMENT_EXISTS") throw e;
    return Assignment.findOne({
      userId,
      roleId,
      societyId,
      status: "ACTIVE",
      isOngoing: true,
    });
  }
};
const createMembership = async (d) => {
  const role = await Role.findById(d.roleId);
  if (!role) fail("Role not found", 404, "ROLE_NOT_FOUND");
  const assignment =
    d.assignment ||
    (await createAssignment({
      ...d,
      metadata: { membershipRequestId: d.linkedMembershipRequestId },
    }));
  try {
    const membership = await Membership.create({
      ...d,
      roleCode: role.code,
      roleName: role.name,
      linkedUserRoleAssignmentId: assignment._id,
      status: "ACTIVE",
      isOngoing: true,
    });
    events.publish("SOCIETY_MEMBERSHIP_CREATED", {
      userId: d.userId,
      studentMasterId: d.studentMasterId,
      metadata: {
        membershipId: String(membership._id),
        societyId: String(d.societyId),
        source: d.membershipSource,
      },
    });
    return membership;
  } catch (e) {
    if (e.code !== 11000) throw e;
    return Membership.findOne({
      userId: d.userId,
      societyId: d.societyId,
      status: "ACTIVE",
    });
  }
};
const createMembershipFromApprovedOnboardingClaim = async (claim) => {
  if (!claim || claim.status !== "APPROVED" || !claim.isOngoing) return null;
  const existing = await Membership.findOne({
    $or: [
      { linkedOnboardingClaimId: claim._id },
      { userId: claim.userId, societyId: claim.societyId, status: "ACTIVE" },
    ],
  });
  if (existing) return existing;
  let assignment =
    claim.activeRoleAssignmentId &&
    (await Assignment.findById(claim.activeRoleAssignmentId));
  if (!assignment)
    assignment = await createAssignment({
      userId: claim.userId,
      roleId: claim.claimedRoleId,
      societyId: claim.societyId,
      academicSession: claim.metadata?.academicSession,
      startDate: claim.startDate,
      source: "ONBOARDING_APPROVAL",
      metadata: { sourceClaimId: claim._id },
    });
  return createMembership({
    userId: claim.userId,
    studentMasterId: claim.studentMasterId,
    societyId: claim.societyId,
    roleId: claim.claimedRoleId,
    academicSession: claim.metadata?.academicSession,
    startDate: claim.startDate || new Date(),
    membershipSource: "ONBOARDING_APPROVAL",
    linkedOnboardingClaimId: claim._id,
    assignment,
  });
};
const assertEndAllowed = async (actor, membership) => {
  const allowed = await authz.hasPermission({
    userId: actor,
    permissionCode: "membership.role.end",
    societyId: membership.societyId,
  });
  if (!allowed.allowed)
    fail("Membership scope forbidden", 403, "MEMBERSHIP_SCOPE_FORBIDDEN");
  const actorRows = await Assignment.find({
    userId: actor,
    status: "ACTIVE",
    isOngoing: true,
    $or: [{ scopeType: "GLOBAL" }, { societyId: membership.societyId }],
  }).populate("roleId");
  if (actorRows.some((x) => x.roleId?.code === "SUPER_ADMIN")) return;
  const target = await Role.findById(membership.roleId);
  const highest = Math.max(...actorRows.map((x) => x.roleId?.rank || -1));
  if (highest <= target.rank) {
    const higher = await authz.hasPermission({
      userId: actor,
      permissionCode: "membership.role.end_higher_role",
      societyId: membership.societyId,
    });
    if (!higher.allowed || highest < target.rank)
      fail(
        "Cannot end an equal or higher role",
        403,
        "MEMBERSHIP_ROLE_END_FORBIDDEN"
      );
  }
};
const endMembership = async ({ membershipId, actorUserId, ...data }) => {
  const current = await Membership.findById(membershipId);
  if (!current) fail("Membership not found", 404, "MEMBERSHIP_NOT_FOUND");
  if (current.status !== "ACTIVE" || !current.isOngoing) return current;
  await assertEndAllowed(actorUserId, current);
  const endDate = data.endDate ? new Date(data.endDate) : new Date();
  if (endDate < current.startDate)
    fail("End date cannot precede start date", 400, "VALIDATION_ERROR");
  if (current.linkedUserRoleAssignmentId)
    await assignments.endAssignment(
      current.linkedUserRoleAssignmentId,
      actorUserId,
      data.endRemarks
    );
  const ended = await Membership.findOneAndUpdate(
    { _id: current._id, status: "ACTIVE", isOngoing: true },
    {
      $set: {
        status: "ENDED",
        isOngoing: false,
        endDate,
        endedAt: new Date(),
        endedBy: actorUserId,
        endReasonCode: data.endReasonCode,
        endReasonText: data.endReasonText,
        endRemarks: data.endRemarks,
        appreciationMessage: data.appreciationMessage,
      },
    },
    { returnDocument: "after", runValidators: true }
  );
  if (!ended) return Membership.findById(current._id);
  events.publish("SOCIETY_MEMBERSHIP_ENDED", {
    userId: ended.userId,
    studentMasterId: ended.studentMasterId,
    metadata: {
      membershipId: String(ended._id),
      societyId: String(ended.societyId),
    },
  });
  return ended;
};
const restoreMembership = async ({ membershipId, actorUserId, reason }) => {
  const m = await Membership.findById(membershipId);
  if (!m) fail("Membership not found", 404, "MEMBERSHIP_NOT_FOUND");
  const p = await authz.hasPermission({
    userId: actorUserId,
    permissionCode: "membership.role.restore",
    societyId: m.societyId,
  });
  if (!p.allowed)
    fail("Restore not allowed", 403, "MEMBERSHIP_RESTORE_NOT_ALLOWED");
  const hours = await settings.getValue("membership.restore_window_hours");
  if (!m.endedAt || Date.now() - m.endedAt.getTime() > hours * 3600000)
    fail("Restore window expired", 409, "MEMBERSHIP_RESTORE_WINDOW_EXPIRED");
  const eligibility = await resolveJoinSocietyEligibility({
    userId: m.userId,
    targetSocietyId: m.societyId,
  });
  if (eligibility.alreadyMember)
    fail("Membership already active", 409, "MEMBERSHIP_ALREADY_ACTIVE");
  if (eligibility.activeSocietyCount >= eligibility.maximumActiveSocieties)
    fail("Membership limit reached", 409, "MEMBERSHIP_LIMIT_REACHED");
  const assignment = await createAssignment({
    userId: m.userId,
    roleId: m.roleId,
    societyId: m.societyId,
    academicSession: m.academicSession,
    startDate: new Date(),
    source: "SYSTEM",
    metadata: { restoredMembershipId: m._id },
  });
  const history = {
    endDate: m.endDate,
    endedAt: m.endedAt,
    endedBy: m.endedBy,
    endReasonCode: m.endReasonCode,
    endReasonText: m.endReasonText,
    endRemarks: m.endRemarks,
    appreciationMessage: m.appreciationMessage,
    restoreReason: reason,
    restoredAt: new Date(),
    restoredBy: actorUserId,
  };
  m.metadata = {
    ...m.metadata,
    restoreHistory: [...(m.metadata?.restoreHistory || []), history],
  };
  m.status = "ACTIVE";
  m.isOngoing = true;
  m.endDate = undefined;
  m.endedAt = undefined;
  m.endedBy = undefined;
  m.linkedUserRoleAssignmentId = assignment._id;
  await m.save();
  events.publish("SOCIETY_MEMBERSHIP_RESTORED", {
    userId: m.userId,
    studentMasterId: m.studentMasterId,
    metadata: { membershipId: String(m._id) },
  });
  return m;
};
const changeMembershipRole = async ({
  membershipId,
  newRoleId,
  effectiveDate,
  reason,
  actorUserId,
  source = "PROMOTION",
}) => {
  const old = await endMembership({
    membershipId,
    actorUserId,
    endDate: effectiveDate,
    endReasonCode: "PROMOTED_TO_ANOTHER_ROLE",
    endReasonText: reason,
  });
  const next = await createMembership({
    userId: old.userId,
    studentMasterId: old.studentMasterId,
    societyId: old.societyId,
    roleId: newRoleId,
    academicSession: old.academicSession,
    startDate: effectiveDate || new Date(),
    membershipSource: source,
    metadata: { previousMembershipId: old._id },
  });
  await Membership.updateOne(
    { _id: old._id },
    { $set: { "metadata.nextMembershipId": next._id } }
  );
  events.publish("SOCIETY_MEMBERSHIP_ROLE_CHANGED", {
    userId: old.userId,
    studentMasterId: old.studentMasterId,
    metadata: {
      previousMembershipId: String(old._id),
      membershipId: String(next._id),
    },
  });
  return next;
};
const reconcileActiveMembershipAssignment=async membershipId=>{
  const membership=await Membership.findOne({_id:membershipId,status:"ACTIVE",isOngoing:true});
  if(!membership)fail("Active membership not found",404,"MEMBERSHIP_NOT_FOUND");
  const now=new Date(),linked=membership.linkedUserRoleAssignmentId&&await Assignment.findById(membership.linkedUserRoleAssignmentId);
  const valid=linked&&linked.status==="ACTIVE"&&linked.isOngoing===true&&(!linked.validFrom||linked.validFrom<=now)&&(!linked.validUntil||linked.validUntil>now)&&String(linked.userId)===String(membership.userId)&&String(linked.societyId)===String(membership.societyId)&&String(linked.roleId)===String(membership.roleId);
  if(valid)return{membership,repaired:false,assignment:linked};
  const assignment=await createAssignment({userId:membership.userId,roleId:membership.roleId,societyId:membership.societyId,academicSession:membership.academicSession,startDate:now,source:"SYSTEM",metadata:{reconciledMembershipId:membership._id}});
  membership.linkedUserRoleAssignmentId=assignment._id;membership.metadata={...(membership.metadata||{}),assignmentReconciledAt:now,previousLinkedAssignmentId:linked?._id||null};await membership.save();
  events.publish("SOCIETY_MEMBERSHIP_ASSIGNMENT_RECONCILED",{userId:membership.userId,studentMasterId:membership.studentMasterId,metadata:{membershipId:String(membership._id),societyId:String(membership.societyId),assignmentId:String(assignment._id)}});
  return{membership,repaired:true,assignment};
};
module.exports = {
  resolveJoinSocietyEligibility,
  createMembership,
  createMembershipFromApprovedOnboardingClaim,
  endMembership,
  restoreMembership,
  changeMembershipRole,
  activeCount,
  reconcileActiveMembershipAssignment,
};
