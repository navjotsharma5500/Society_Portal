const AppError = require("../../common/errors/AppError"),
  Onboarding = require("./studentOnboarding.model"),
  Student = require("../studentMaster/studentMaster.model"),
  Claim = require("../societyClaims/societyClaim.model"),
  MembershipRequest = require("../membershipRequests/membershipRequest.model"),
  Society = require("../societies/society.model"),
  Role = require("../roles/role.model"),
  Assignment = require("../userRoleAssignments/userRoleAssignment.model"),
  settings = require("../portalSettings/portalSetting.service"),
  events = require("../../common/events/domainEvent.service"),
  routing = require("../verificationRouting/verificationRouting.service"),
  {
    activeWindow,
  } = require("../userRoleAssignments/userRoleAssignment.service");
const pendingStatuses = ["SUBMITTED", "PENDING", "RESUBMITTED"],
  rejectedStatuses = ["REJECTED", "RESUBMISSION_ALLOWED", "ACCEPTED_AS_FINAL"];
const getReferences = async () => {
  const [societies, roles] = await Promise.all([
    Society.find({ status: "ACTIVE", isActive: { $ne: false } })
      .select("name code category")
      .sort({ name: 1 })
      .lean(),
    Role.find({
      status: "ACTIVE",
      isAssignable: true,
      isStudentRole: true,
      scopeType: { $in: ["SOCIETY", "BOTH"] },
    })
      .select("name code category scopeType")
      .sort({ rank: -1, name: 1 })
      .lean(),
  ]);
  return { societies, roles };
};
const getForUser = async (userId) => {
  const item = await Onboarding.findOne({ userId });
  if (!item)
    throw new AppError("Onboarding not found", 404, "ONBOARDING_NOT_FOUND");
  return item;
};
const getMe = async (userId) => {
  const onboarding = await getForUser(userId);
  const student = await Student.findById(onboarding.studentMasterId)
    .select("-metadata -createdBy -updatedBy")
    .lean();
  return { onboarding, student };
};
const updateDraft = async (userId, data) => {
  const onboarding = await getForUser(userId);
  if (!["IN_PROGRESS", "CHANGES_REQUESTED"].includes(onboarding.status))
    throw new AppError(
      "Onboarding is not editable",
      409,
      "ONBOARDING_STATE_INVALID"
    );
  return Onboarding.findByIdAndUpdate(
    onboarding._id,
    { $set: { metadata: { ...onboarding.metadata, ...data.metadata } } },
    { returnDocument: "after", runValidators: true }
  );
};
const start = async ({ user, student }) => {
  if (!student)
    throw new AppError(
      "Student master record is missing",
      403,
      "STUDENT_MASTER_NOT_FOUND"
    );
  let item = await Onboarding.findOne({ userId: user._id });
  if (item) {
    if (item.status === "NOT_STARTED")
      item = await Onboarding.findOneAndUpdate(
        { _id: item._id, status: "NOT_STARTED" },
        { $set: { status: "IN_PROGRESS" } },
        { returnDocument: "after" }
      );
    return item;
  }
  try {
    item = await Onboarding.create({
      userId: user._id,
      studentMasterId: student._id,
      status: "IN_PROGRESS",
    });
    events.publish("ONBOARDING_STARTED", {
      userId: user._id,
      studentMasterId: student._id,
    });
    return item;
  } catch (e) {
    if (e.code === 11000) return getForUser(user._id);
    throw e;
  }
};
const deriveSummary = (claims) => ({
  totalClaims: claims.length,
  approvedClaims: claims.filter((x) => x.status === "APPROVED").length,
  rejectedClaims: claims.filter((x) => rejectedStatuses.includes(x.status))
    .length,
  pendingClaims: claims.filter((x) => pendingStatuses.includes(x.status))
    .length,
  lockedClaims: claims.filter((x) => x.status === "LOCKED").length,
  approvedOngoingClaims: claims.filter(
    (x) => x.status === "APPROVED" && x.isOngoing
  ).length,
  approvedEndedClaims: claims.filter(
    (x) => x.status === "APPROVED" && !x.isOngoing
  ).length,
});
const deriveStatus = (onboarding, s) => {
  if (onboarding.hasAcceptedPartialResult) return "COMPLETED";
  if (s.totalClaims && s.approvedClaims === s.totalClaims) return "APPROVED";
  if (s.approvedClaims > 0) return "PARTIALLY_VERIFIED";
  if (s.pendingClaims > 0) return "UNDER_VERIFICATION";
  if (s.totalClaims && s.lockedClaims + s.rejectedClaims === s.totalClaims)
    return s.lockedClaims === s.totalClaims ? "LOCKED" : "FULLY_REJECTED";
  return onboarding.status;
};
const recalculateOnboardingSummary = async (onboardingId) => {
  const [onboarding, claims] = await Promise.all([
    Onboarding.findById(onboardingId),
    Claim.find({ onboardingId })
      .select("status isOngoing attemptNumber")
      .lean(),
  ]);
  if (!onboarding)
    throw new AppError("Onboarding not found", 404, "ONBOARDING_NOT_FOUND");
  const summary = deriveSummary(claims),
    status = deriveStatus(onboarding, summary),
    currentAttempt = Math.max(
      1,
      ...claims.map((claim) => claim.attemptNumber || 1)
    );
  const updated = await Onboarding.findByIdAndUpdate(
    onboardingId,
    {
      $set: {
        summary,
        currentAttempt,
        status,
        ...(status === "COMPLETED" && !onboarding.completedAt
          ? { completedAt: new Date() }
          : {}),
      },
    },
    { returnDocument: "after" }
  );
  if (status === "PARTIALLY_VERIFIED" && onboarding.status !== status)
    events.publish("ONBOARDING_PARTIALLY_APPROVED", {
      userId: onboarding.userId,
      studentMasterId: onboarding.studentMasterId,
    });
  if (
    ["APPROVED", "COMPLETED"].includes(status) &&
    onboarding.status !== status
  )
    events.publish("ONBOARDING_COMPLETED", {
      userId: onboarding.userId,
      studentMasterId: onboarding.studentMasterId,
    });
  return updated;
};
const submit = async (userId,requestedMode) => {
  const onboarding = await getForUser(userId);
  if (!["IN_PROGRESS", "CHANGES_REQUESTED"].includes(onboarding.status))
    throw new AppError(
      "Onboarding has already been submitted",
      409,
      "ONBOARDING_ALREADY_SUBMITTED"
    );
  const claims = await Claim.find({
    onboardingId: onboarding._id,
    status: "DRAFT",
  }).lean();
  const joinRequest=await MembershipRequest.findOne({userId,status:{$in:["SUBMITTED","PENDING","APPROVED"]}}).sort({createdAt:-1}).lean(),mode=requestedMode||(claims.length&&joinRequest?"MIXED":claims.length?"EXISTING_PARTICIPATION":joinRequest?"NEW_JOIN_REQUEST":null);
  if (!mode)
    throw new AppError(
      "Add existing participation or submit a society join request",
      400,
      "ONBOARDING_NO_CLAIMS"
    );
  if (["EXISTING_PARTICIPATION","MIXED"].includes(mode)&&!claims.length)throw new AppError("At least one society claim is required",400,"ONBOARDING_NO_CLAIMS");
  if (["NEW_JOIN_REQUEST","MIXED"].includes(mode)&&!joinRequest)throw new AppError("A valid membership request is required",400,"ONBOARDING_JOIN_REQUEST_REQUIRED");
  if(mode==="NEW_JOIN_REQUEST"){
    const changed=await Onboarding.findOneAndUpdate({_id:onboarding._id,status:onboarding.status},{$set:{mode,status:"COMPLETED",submittedAt:new Date(),completedAt:new Date()}},{returnDocument:"after"});
    if(!changed)throw new AppError("Onboarding has already been submitted",409,"ONBOARDING_ALREADY_SUBMITTED");
    events.publish("ONBOARDING_COMPLETED",{userId,studentMasterId:onboarding.studentMasterId,metadata:{mode,joinRequestId:String(joinRequest._id)}});
    return{onboarding:changed,claims:[],membershipRequest:joinRequest,mode};
  }
  const routes = await Promise.all(
    claims.map((c) =>
      routing.resolveClaimVerifiers({
        societyId: c.societyId,
        claimedRoleId: c.claimedRoleId,
        academicSession: c.metadata?.academicSession,
        claimantUserId: c.userId,
      })
    )
  );
  const changed = await Onboarding.findOneAndUpdate(
    { _id: onboarding._id, status: onboarding.status },
    {
      $set: {
        status: "UNDER_VERIFICATION",
        submittedAt: new Date(),
        verificationStartedAt: new Date(),
        mode,
      },
    },
    { returnDocument: "after" }
  );
  if (!changed)
    throw new AppError(
      "Onboarding has already been submitted",
      409,
      "ONBOARDING_ALREADY_SUBMITTED"
    );
  await Claim.bulkWrite(
    claims.map((c, i) => ({
      updateOne: {
        filter: { _id: c._id, status: "DRAFT" },
        update: {
          $set: {
            status: "PENDING",
            verificationRouteType: routes[i].routeType,
            verificationTargetUserIds: routes[i].eligibleVerifierUserIds,
            "metadata.routingReason": routes[i].reason,
            "metadata.routingFallbackUsed": routes[i].fallbackUsed,
            "metadata.reviewTier": routes[i].reviewTier,
            "metadata.reviewCapability": routes[i].capability,
          },
        },
      },
    }))
  );
  for (const c of claims) {
    events.publish("SOCIETY_CLAIM_ROUTED", {
      userId,
      studentMasterId: onboarding.studentMasterId,
      metadata: { claimId: String(c._id), societyId: String(c.societyId), verificationTargetUserIds: routes[claims.indexOf(c)].eligibleVerifierUserIds.map(String) },
    });
    events.publish("CLAIM_VERIFICATION_ASSIGNED", {userId,studentMasterId:onboarding.studentMasterId,metadata:{claimId:String(c._id),societyId:String(c.societyId)}});
  }
  events.publish("ONBOARDING_SUBMITTED", {
    userId,
    studentMasterId: onboarding.studentMasterId,
    metadata: { claimCount: claims.length },
  });
  return{...(await progress(userId)),membershipRequest:joinRequest||null,mode};
};
const progress = async (userId) => {
  const onboarding = await getForUser(userId),
    claims = await Claim.find({ onboardingId: onboarding._id })
      .select("-metadata -verificationTargetUserIds")
      .populate("societyId", "name code")
      .populate("claimedRoleId", "name code rank")
      .sort({ createdAt: 1 })
      .lean(),
    updated = await recalculateOnboardingSummary(onboarding._id),
    s = updated.summary;
  return {
    onboarding: updated,
    summary: s,
    claims: claims.map((c) => ({
      ...c,
      society: c.societyId,
      role: c.claimedRoleId,
      canResubmit:
        ["REJECTED", "RESUBMISSION_ALLOWED"].includes(c.status) &&
        c.attemptNumber < 2,
      showReasonInfo: Boolean(c.rejectionReason),
    })),
    actions: {
      canGoToDashboard: s.approvedClaims > 0 || s.pendingClaims === 0,
      canResubmitRejected:
        s.rejectedClaims > 0 &&
        claims.some(
          (c) =>
            c.attemptNumber < 2 &&
            ["REJECTED", "RESUBMISSION_ALLOWED"].includes(c.status)
        ),
      mustWaitForPending: s.pendingClaims > 0 && s.approvedClaims === 0,
      allRejected:
        s.totalClaims > 0 &&
        s.rejectedClaims + s.lockedClaims === s.totalClaims,
      joinSocietyAvailable: (
        await resolveOnboardingDashboardEligibility(userId)
      ).joinSocietyAvailable,
    },
  };
};
const acceptCurrentResult = async (userId) => {
  const onboarding = await getForUser(userId),
    updated = await recalculateOnboardingSummary(onboarding._id),
    s = updated.summary;
  if (!(s.approvedClaims > 0 || (s.totalClaims > 0 && s.pendingClaims === 0)))
    throw new AppError(
      "Current onboarding result cannot be accepted",
      409,
      "CURRENT_RESULT_NOT_ACCEPTABLE"
    );
  const accepted =
    (await Onboarding.findOneAndUpdate(
      { _id: onboarding._id, hasAcceptedPartialResult: false },
      {
        $set: {
          hasAcceptedPartialResult: true,
          acceptedCurrentResultAt: new Date(),
          completedAt: new Date(),
          status: "COMPLETED",
        },
      },
      { returnDocument: "after" }
    )) || (await Onboarding.findById(onboarding._id));
  await Claim.updateMany(
    {
      onboardingId: onboarding._id,
      status: { $in: ["REJECTED", "RESUBMISSION_ALLOWED"] },
    },
    { $set: { status: "ACCEPTED_AS_FINAL" } }
  );
  await recalculateOnboardingSummary(onboarding._id);
  events.publish("ONBOARDING_RESULT_ACCEPTED", {
    userId,
    studentMasterId: onboarding.studentMasterId,
  });
  return accepted;
};
const resolveOnboardingDashboardEligibility = async (userId) => {
  const onboarding = await Onboarding.findOne({ userId }).lean(),
    claims = onboarding
      ? await Claim.find({ onboardingId: onboarding._id })
          .select("status isOngoing")
          .lean()
      : [],
    activeSocietyCount = (
      await Assignment.distinct("societyId", {
        userId,
        scopeType: "SOCIETY",
        ...activeWindow(new Date()),
      })
    ).length,
    maxActiveSocieties = await settings.getValue(
      "membership.max_active_societies_per_student"
    ),
    remainingSocietySlots = Math.max(
      0,
      maxActiveSocieties - activeSocietyCount
    ),
    summary = deriveSummary(claims),
    final =
      onboarding &&
      (["COMPLETED", "LOCKED", "FULLY_REJECTED", "APPROVED"].includes(
        onboarding.status
      ) ||
        onboarding.hasAcceptedPartialResult);
  return {
    canAccessDashboard: Boolean(final || summary.approvedClaims > 0),
    reason:
      summary.approvedClaims > 0
        ? "APPROVED_CLAIM_AVAILABLE"
        : final
        ? "ONBOARDING_FINAL_STATE"
        : "ONBOARDING_NOT_READY",
    approvedOngoingContexts: summary.approvedOngoingClaims,
    approvedEndedHistoryCount: summary.approvedEndedClaims,
    pendingCount: summary.pendingClaims,
    rejectedCount: summary.rejectedClaims,
    lockedCount: summary.lockedClaims,
    activeSocietyCount,
    maxActiveSocieties,
    remainingSocietySlots,
    joinSocietyAvailable: remainingSocietySlots > 0,
  };
};
module.exports = {
  getReferences,
  start,
  getForUser,
  getMe,
  updateDraft,
  submit,
  progress,
  acceptCurrentResult,
  recalculateOnboardingSummary,
  resolveOnboardingDashboardEligibility,
};
