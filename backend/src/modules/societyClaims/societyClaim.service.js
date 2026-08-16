const mongoose = require("mongoose"),
  AppError = require("../../common/errors/AppError"),
  Claim = require("./societyClaim.model"),
  Society = require("../societies/society.model"),
  Role = require("../roles/role.model"),
  onboardingService = require("../studentOnboarding/studentOnboarding.service"),
  routing = require("../verificationRouting/verificationRouting.service"),
  events = require("../../common/events/domainEvent.service");
const valid = (id) => mongoose.Types.ObjectId.isValid(id);
const validateDates = (data) => {
  const start = new Date(data.startDate),
    end = data.endDate ? new Date(data.endDate) : null,
    today = new Date();
  today.setHours(23, 59, 59, 999);
  if (
    Number.isNaN(start.getTime()) ||
    (data.isOngoing && end) ||
    (!data.isOngoing && !end) ||
    (end && end < start)
  )
    throw new AppError(
      "The membership date range is invalid",
      400,
      "MEMBERSHIP_DATE_RANGE_INVALID"
    );
  if (start > today || (!data.isOngoing && end > today))
    throw new AppError("Membership dates cannot be in the future", 400, "MEMBERSHIP_DATE_RANGE_INVALID");
  for (const [index, event] of (data.events || []).entries()) {
    const es = new Date(event.startDate),
      ee = event.endDate ? new Date(event.endDate) : es;
    if (Number.isNaN(es.getTime()) || Number.isNaN(ee.getTime()) || ee < es)
      throw new AppError(
        "Event date range is invalid",
        400,
        "MEMBERSHIP_DATE_RANGE_INVALID"
      );
    const upper = data.isOngoing ? today : end;
    if (data.isOngoing && (es > today || ee > today)) {
      const error = new AppError("Previous membership event dates cannot be in the future", 400, "MEMBERSHIP_EVENT_DATE_IN_FUTURE");
      error.fields = [{ field: `events.${index}.startDate`, message: error.message }];
      throw error;
    }
    if (es < start || ee > upper) {
      const error = new AppError("The event date must fall within the selected membership period", 400, "MEMBERSHIP_EVENT_DATE_OUTSIDE_RANGE");
      error.fields = [{ field: `events.${index}.${es < start ? "startDate" : "endDate"}`, message: error.message }];
      throw error;
    }
  }
};
const validateReferences = async (data) => {
  if (
    !valid(data.societyId) ||
    !(await Society.exists({
      _id: data.societyId,
      status: "ACTIVE",
      isActive: { $ne: false },
    }))
  )
    throw new AppError(
      "Society is invalid or inactive",
      400,
      "CLAIM_SOCIETY_INVALID"
    );
  const role = valid(data.claimedRoleId)
    ? await Role.findOne({ _id: data.claimedRoleId, status: "ACTIVE" })
    : null;
  if (!role || !["SOCIETY", "BOTH"].includes(role.scopeType))
    throw new AppError(
      "Role is invalid for society scope",
      400,
      "CLAIM_ROLE_INVALID"
    );
  return role;
};
const assertNoOverlap = async ({
  onboardingId,
  societyId,
  claimedRoleId,
  startDate,
  endDate,
  excludeId,
}) => {
  const q = {
    onboardingId,
    societyId,
    claimedRoleId,
    status: {
      $nin: ["REJECTED", "RESUBMISSION_ALLOWED", "LOCKED", "ACCEPTED_AS_FINAL"],
    },
    startDate: { $lte: endDate || new Date("9999-12-31") },
    $or: [
      { endDate: null },
      { endDate: { $exists: false } },
      { endDate: { $gte: startDate } },
    ],
  };
  if (excludeId) q._id = { $ne: excludeId };
  if (await Claim.exists(q))
    throw new AppError(
      "An overlapping society role claim already exists",
      409,
      "CLAIM_DUPLICATE"
    );
};
const addClaim = async (userId, data) => {
  const onboarding = await onboardingService.getForUser(userId);
  if (!["IN_PROGRESS", "CHANGES_REQUESTED"].includes(onboarding.status))
    throw new AppError(
      "Claims cannot be added in the current state",
      409,
      "ONBOARDING_STATE_INVALID"
    );
  const MembershipRequest = require("../membershipRequests/membershipRequest.model");
  if (await MembershipRequest.exists({ userId }))
    throw new AppError("Choose only one society journey during onboarding",409,"ONBOARDING_JOURNEY_CONFLICT");
  validateDates(data);
  const role = await validateReferences(data);
  await assertNoOverlap({ onboardingId: onboarding._id, ...data });
  let claim;
  try {
    claim = await Claim.create({
      ...data,
      onboardingId: onboarding._id,
      studentMasterId: onboarding.studentMasterId,
      userId,
      claimedRoleCode: role.code,
      claimedRoleName: role.name,
      status: "DRAFT",
      endDate: data.isOngoing ? null : data.endDate,
    });
  } catch (error) {
    if (error?.code === 11000)
      throw new AppError(
        "A duplicate society role claim already exists",
        409,
        "CLAIM_DUPLICATE"
      );
    throw error;
  }
  await onboardingService.recalculateOnboardingSummary(onboarding._id);
  return claim;
};
const owned = async (userId, claimId) => {
  if (!valid(claimId))
    throw new AppError("Claim not found", 404, "CLAIM_NOT_FOUND");
  const claim = await Claim.findOne({ _id: claimId, userId });
  if (!claim) throw new AppError("Claim not found", 404, "CLAIM_NOT_FOUND");
  return claim;
};
const getOwnedClaim=async(userId,claimId)=>{const claim=await owned(userId,claimId);if(!["REJECTED","RESUBMISSION_ALLOWED"].includes(claim.status)||claim.attemptNumber>=2)throw new AppError("Claim is not available for correction",409,"CLAIM_NOT_EDITABLE");return Claim.findById(claim._id).select("-verificationTargetUserIds").populate("societyId","name code").populate("claimedRoleId","name code rank").lean()};
const editClaim = async (userId, claimId, data) => {
  const claim = await owned(userId, claimId);
  if (!["DRAFT", "REJECTED", "RESUBMISSION_ALLOWED"].includes(claim.status))
    throw new AppError("Claim is not editable", 409, "CLAIM_NOT_EDITABLE");
  const merged = { ...claim.toObject(), ...data };
  validateDates(merged);
  const role = await validateReferences(merged);
  await assertNoOverlap({
    onboardingId: claim.onboardingId,
    societyId: merged.societyId,
    claimedRoleId: merged.claimedRoleId,
    startDate: merged.startDate,
    endDate: merged.isOngoing ? null : merged.endDate,
    excludeId: claim._id,
  });
  const updated = await Claim.findOneAndUpdate(
    { _id: claim._id, status: claim.status },
    {
      $set: {
        ...data,
        claimedRoleCode: role.code,
        claimedRoleName: role.name,
        endDate: merged.isOngoing ? null : merged.endDate,
        ...(["REJECTED", "RESUBMISSION_ALLOWED"].includes(claim.status)
          ? { status: "RESUBMISSION_ALLOWED" }
          : {}),
      },
    },
    { returnDocument: "after", runValidators: true }
  );
  if (!updated)
    throw new AppError(
      "Claim was changed concurrently",
      409,
      "CLAIM_NOT_EDITABLE"
    );
  if(["REJECTED","RESUBMISSION_ALLOWED"].includes(claim.status)&&data.societyId&&String(data.societyId)!==String(claim.societyId))throw new AppError("Society cannot be changed during correction",409,"CLAIM_SOCIETY_LOCKED");
  await onboardingService.recalculateOnboardingSummary(claim.onboardingId);
  return updated;
};
const deleteDraft = async (userId, claimId) => {
  const claim = await Claim.findOneAndDelete({
    _id: claimId,
    userId,
    status: "DRAFT",
  });
  if (!claim)
    throw new AppError(
      "Only draft claims can be deleted",
      409,
      "CLAIM_NOT_EDITABLE"
    );
  await onboardingService.recalculateOnboardingSummary(claim.onboardingId);
  return { deletedClaimId: claim.id };
};
const resubmit = async (userId, claimId) => {
  const claim = await owned(userId, claimId);
  if (!["REJECTED", "RESUBMISSION_ALLOWED"].includes(claim.status))
    throw new AppError(
      "Claim cannot be resubmitted",
      409,
      "CLAIM_RESUBMISSION_NOT_ALLOWED"
    );
  if (claim.attemptNumber >= 2)
    throw new AppError(
      "Maximum claim attempts reached",
      409,
      "CLAIM_MAX_ATTEMPTS_REACHED"
    );
  const route = await routing.resolveClaimVerifiers({
    societyId: claim.societyId,
    claimedRoleId: claim.claimedRoleId,
    academicSession: claim.metadata?.academicSession,
  });
  const updated = await Claim.findOneAndUpdate(
    {
      _id: claim._id,
      status: { $in: ["REJECTED", "RESUBMISSION_ALLOWED"] },
      attemptNumber: 1,
    },
    {
      $set: {
        status: "PENDING",
        attemptNumber: 2,
        verificationRouteType: route.routeType,
        verificationTargetUserIds: route.eligibleVerifierUserIds,
        rejectionReason: null,
        rejectedBy: null,
        decisionAt: null,
        "metadata.routingReason": route.reason,
        "metadata.routingFallbackUsed": route.fallbackUsed,
        "metadata.reviewTier": route.reviewTier,
        "metadata.reviewCapability": route.capability,
      },
    },
    { returnDocument: "after", runValidators: true }
  );
  if (!updated)
    throw new AppError(
      "Claim cannot be resubmitted",
      409,
      "CLAIM_RESUBMISSION_NOT_ALLOWED"
    );
  events.publish("SOCIETY_CLAIM_RESUBMITTED", {
    userId,
    studentMasterId: claim.studentMasterId,
    metadata: { claimId: String(claim._id), attemptNumber: 2 },
  });
  events.publish("SOCIETY_CLAIM_ROUTED", {
    userId,
    studentMasterId: claim.studentMasterId,
    metadata: { claimId: String(claim._id), societyId: String(claim.societyId), verificationTargetUserIds: route.eligibleVerifierUserIds.map(String) },
  });
  events.publish("CLAIM_VERIFICATION_ASSIGNED", {userId,studentMasterId:claim.studentMasterId,metadata:{claimId:String(claim._id),societyId:String(claim.societyId)}});
  await onboardingService.recalculateOnboardingSummary(claim.onboardingId);
  return updated;
};
module.exports = {
  addClaim,
  editClaim,
  deleteDraft,
  resubmit,
  owned,
  getOwnedClaim,
  validateDates,
};
