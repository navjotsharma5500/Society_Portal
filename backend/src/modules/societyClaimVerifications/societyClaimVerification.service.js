const mongoose = require("mongoose"),
  AppError = require("../../common/errors/AppError"),
  Claim = require("../societyClaims/societyClaim.model"),
  Verification = require("./societyClaimVerification.model"),
  Role = require("../roles/role.model"),
  Assignment = require("../userRoleAssignments/userRoleAssignment.model"),
  assignmentService = require("../userRoleAssignments/userRoleAssignment.service"),
  authz = require("../authorization/authorization.service"),
  onboardingService = require("../studentOnboarding/studentOnboarding.service"),
  events = require("../../common/events/domainEvent.service"),
  repo = require("./societyClaimVerification.repository"),
  routing = require("../verificationRouting/verificationRouting.service"),
  { VERIFICATION_DECISIONS } = require("./societyClaimVerification.constants");
const permissionFor = {
  APPROVED: "verification.claim.approve",
  REJECTED: "verification.claim.reject",
  REQUEST_CHANGES: "verification.claim.request_changes",
};
const reconcileUserSocietyQueues = async (userId, societyId) => {
  const societyIds = societyId
    ? [societyId]
    : await Assignment.distinct("societyId", {
        userId,
        scopeType: "SOCIETY",
        ...assignmentService.activeWindow(new Date()),
      });
  const scoped = societyIds.filter(Boolean);
  if (scoped.length) await routing.reconcilePendingClaims({ societyIds: scoped });
};
const getAuthorizedClaim = async (userId, claimId, permission) => {
  if (!mongoose.Types.ObjectId.isValid(claimId))
    throw new AppError("Claim not found", 404, "CLAIM_NOT_FOUND");
  const claim = await Claim.findById(claimId);
  if (!claim) throw new AppError("Claim not found", 404, "CLAIM_NOT_FOUND");
  if(String(claim.userId)===String(userId))throw new AppError("You cannot review your own claim",403,"SELF_APPROVAL_FORBIDDEN");
  const [auth, globalVisibility] = await Promise.all([authz.hasPermission({
    userId,
    permissionCode: permission,
    societyId: claim.societyId,
  }), authz.hasPermission({ userId, permissionCode: "verification.queue.global.view" })]);
  let currentlyAssigned = false;
  if (!globalVisibility.allowed) {
    try {
      const route = await routing.resolveClaimVerifiers({ societyId: claim.societyId, claimedRoleId: claim.claimedRoleId, claimantUserId: claim.userId });
      currentlyAssigned = route.eligibleVerifierUserIds.some((id) => String(id) === String(userId));
    } catch (error) {
      if (error.code !== "VERIFICATION_ROUTE_UNAVAILABLE") throw error;
    }
  }
  if (
    !auth.allowed ||
    (!currentlyAssigned && !globalVisibility.allowed)
  )
    throw new AppError(
      "Verifier is not authorized for this claim",
      403,
      "VERIFIER_NOT_AUTHORIZED"
    );
  return claim;
};
const assignedToMe = async (userId, { page, limit, filters }) => {
  await reconcileUserSocietyQueues(userId, filters?.societyId);
  const globalVisibility = await authz.hasPermission({ userId, permissionCode: "verification.queue.global.view" });
  const result = await repo.assignedQueue(userId, page, limit, filters, globalVisibility.allowed);
  const societyIds = [...new Set(result.items.map((item) => String(item.societyId?._id || item.societyId)))];
  const permissionRows = await Promise.all(societyIds.map(async (societyId) => [societyId, await authz.hasPermission({
        userId,
        permissionCode: "verification.queue.view",
        societyId,
      })]));
  const permissionsBySociety = new Map(permissionRows);
  const items = result.items.filter((item) => permissionsBySociety.get(String(item.societyId?._id || item.societyId))?.allowed);
  if (result.items.length && !items.length)
    throw new AppError(
      "Verification queue access denied",
      403,
      "VERIFIER_NOT_AUTHORIZED"
    );
  return {
    items,
    pagination: {
      page,
      limit,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / limit),
    },
  };
};
const getClaim = async (userId, claimId) => {
  const claim = await getAuthorizedClaim(
    userId,
    claimId,
    "verification.claim.view"
  );
  return {
    claim: await Claim.findById(claim._id)
      .select("-metadata")
      .populate("societyId", "name code")
      .populate("claimedRoleId", "name code rank")
      .populate("studentMasterId", "name rollNumber email course branch year")
      .lean(),
    decisions: await repo.findByClaim(claim._id),
  };
};
const createActiveAssignment = async (claim) => {
  try {
    return (
      await assignmentService.createAssignment({
        userId: claim.userId,
        roleId: claim.claimedRoleId,
        scopeType: "SOCIETY",
        societyId: claim.societyId,
        academicSession: claim.metadata?.academicSession || null,
        validFrom: claim.startDate,
        validUntil: null,
        isOngoing: true,
        status: "ACTIVE",
        assignmentSource: "PROFILE_APPROVAL",
        metadata: { sourceClaimId: claim._id },
      })
    ).entity;
  } catch (e) {
    if (e.code !== "ROLE_ASSIGNMENT_EXISTS") throw e;
    return Assignment.findOne({
      userId: claim.userId,
      roleId: claim.claimedRoleId,
      scopeType: "SOCIETY",
      societyId: claim.societyId,
      status: "ACTIVE",
      isOngoing: true,
    });
  }
};
const assertApprovedMembershipConsistency=async(claim,assignment,membership)=>{const valid=membership&&membership.status==="ACTIVE"&&membership.isOngoing===true&&String(membership.societyId)===String(claim.societyId)&&String(membership.userId)===String(claim.userId)&&assignment&&assignment.status==="ACTIVE"&&assignment.isOngoing===true&&String(assignment.societyId)===String(claim.societyId)&&String(assignment.roleId)===String(claim.claimedRoleId);if(!valid)throw new AppError("Approved membership consistency check failed",500,"APPROVAL_MEMBERSHIP_INCONSISTENT");return true};
const decide = async ({ userId, claimId, decision, reason, remarks }) => {
  if (["REJECTED", "REQUEST_CHANGES"].includes(decision) && !reason)
    throw new AppError(
      "A reason is required",
      400,
      "REJECTION_REASON_REQUIRED"
    );
  const claim = await getAuthorizedClaim(
    userId,
    claimId,
    permissionFor[decision]
  );
  if(String(claim.userId)===String(userId))throw new AppError("You cannot review your own claim",403,"SELF_APPROVAL_FORBIDDEN");
  if(decision==="APPROVED"&&claim.status==="APPROVED")return claim;
  if (claim.status !== "PENDING")
    throw new AppError(
      "Claim has already been decided",
      409,
      "CLAIM_ALREADY_DECIDED"
    );
  if (
    await Verification.exists({
      claimId: claim._id,
      attemptNumber: claim.attemptNumber,
      verifierUserId: userId,
    })
  )
    throw new AppError(
      "Verification already submitted",
      409,
      "VERIFICATION_ALREADY_SUBMITTED"
    );
  let nextStatus =
    decision === "APPROVED"
      ? "APPROVED"
      : claim.attemptNumber >= 2
      ? "LOCKED"
      : decision === "REQUEST_CHANGES"
      ? "RESUBMISSION_ALLOWED"
      : "REJECTED";
  const update = {
    status: nextStatus,
    decisionAt: new Date(),
    verificationRemarks: remarks || null,
    ...(decision === "APPROVED"
      ? { approvedBy: userId, rejectionReason: null }
      : { rejectedBy: userId, rejectionReason: reason }),
  };
  const changed = await Claim.findOneAndUpdate(
    { _id: claim._id, status: "PENDING", attemptNumber: claim.attemptNumber },
    { $set: update },
    { returnDocument: "after", runValidators: true }
  );
  if (!changed)
    throw new AppError(
      "Claim has already been decided",
      409,
      "CLAIM_ALREADY_DECIDED"
    );
  const verifierAssignment = await Assignment.findOne({
    userId,
    societyId: claim.societyId,
    status: "ACTIVE",
    isOngoing: true,
  })
    .populate("roleId")
    .sort({ createdAt: -1 });
  await Verification.create({
    claimId: claim._id,
    attemptNumber: claim.attemptNumber,
    verifierUserId: userId,
    verifierRoleId: verifierAssignment?.roleId?._id,
    verifierRoleCode: verifierAssignment?.roleId?.code,
    decision,
    reason,
    remarks,
  });
  if (decision === "APPROVED" && claim.isOngoing) {
    const assignment = await createActiveAssignment(claim);
    await Claim.updateOne(
      { _id: claim._id },
      { $set: { activeRoleAssignmentId: assignment._id } }
    );
    changed.activeRoleAssignmentId = assignment._id;
    const membershipLifecycle = require("../membershipLifecycle/membershipLifecycle.service");
    const membership=await membershipLifecycle.createMembershipFromApprovedOnboardingClaim({
      ...claim.toObject(),
      status: "APPROVED",
      activeRoleAssignmentId: assignment._id,
    });
    try{await assertApprovedMembershipConsistency(claim,assignment,membership)}catch(error){await Claim.updateOne({_id:claim._id},{$set:{"metadata.approvalConsistency":{status:"RECOVERY_REQUIRED",code:error.code,recordedAt:new Date(),assignmentId:assignment?._id,membershipId:membership?._id}}});throw error}
    events.publish("PROFILE_ROLE_ASSIGNMENT_CREATED", {
      userId: claim.userId,
      studentMasterId: claim.studentMasterId,
      metadata: {
        claimId: String(claim._id),
        assignmentId: String(assignment._id),
      },
    });
  }
  const eventType = decision === "APPROVED" ? "CLAIM_VERIFICATION_APPROVED" : decision === "REQUEST_CHANGES" ? "CLAIM_CORRECTION_REQUESTED" : "CLAIM_VERIFICATION_REJECTED";
  events.publish(eventType, {
    userId: claim.userId,
    studentMasterId: claim.studentMasterId,
    metadata: {
      claimId: String(claim._id),
      societyId: String(claim.societyId),
      verificationTargetUserIds: claim.verificationTargetUserIds.map(String),
      attemptNumber: claim.attemptNumber,
      decision,
    },
  });
  if (nextStatus === "LOCKED")
    events.publish("SOCIETY_CLAIM_LOCKED", {
      userId: claim.userId,
      studentMasterId: claim.studentMasterId,
      metadata: { claimId: String(claim._id) },
    });
  await onboardingService.recalculateOnboardingSummary(claim.onboardingId);
  return changed;
};
const assignedCounts = async (userId, filters = {}) => {
  await reconcileUserSocietyQueues(userId, filters?.societyId || (filters instanceof mongoose.Types.ObjectId ? filters : null));
  const globalVisibility = await authz.hasPermission({ userId, permissionCode: "verification.queue.global.view" });
  return repo.assignedCounts(userId, filters, globalVisibility.allowed);
};
module.exports = {
  assignedToMe,
  assignedCounts,
  getClaim,
  decide,
  approve: (args) =>
    decide({ ...args, decision: VERIFICATION_DECISIONS.APPROVED }),
  reject: (args) =>
    decide({ ...args, decision: VERIFICATION_DECISIONS.REJECTED }),
  requestChanges: (args) =>
    decide({ ...args, decision: VERIFICATION_DECISIONS.REQUEST_CHANGES }),
  assertApprovedMembershipConsistency,
};
