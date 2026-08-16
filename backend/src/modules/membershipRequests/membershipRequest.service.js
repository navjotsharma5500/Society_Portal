const mongoose = require("mongoose"),
  AppError = require("../../common/errors/AppError"),
  Request = require("./membershipRequest.model"),
  Role = require("../roles/role.model"),
  User = require("../users/user.model"),
  authz = require("../authorization/authorization.service"),
  routing = require("../verificationRouting/verificationRouting.service"),
  lifecycle = require("../membershipLifecycle/membershipLifecycle.service"),
  settings = require("../portalSettings/portalSetting.service"),
  events = require("../../common/events/domainEvent.service");
const fail = (m, s, c) => {
    throw new AppError(m, s, c);
  },
  populate = (q) =>
    q
      .select("-metadata")
      .populate("societyId", "name code")
      .populate("studentMasterId", "name rollNumber email course branch year")
      .populate("requestedRoleId", "name code rank")
      .populate("approvedRoleId", "name code rank");
const submit = async ({
  user,
  student,
  societyId,
  requestReason,
  studentMessage,
}) => {
  if (user.accountType !== "STUDENT" || !student)
    fail("Student account required", 403, "JOIN_SOCIETY_NOT_ELIGIBLE");
  const [maxLiveRequests, liveRequestCount] = await Promise.all([
    settings.getValue("membership.max_live_join_requests_per_student"),
    Request.countDocuments({ userId: user._id, status: { $in: ["SUBMITTED", "PENDING", "CLARIFICATION_REQUESTED"] } }),
  ]);
  if (liveRequestCount >= maxLiveRequests)
    fail("Maximum live join requests reached", 409, "LIVE_MEMBERSHIP_REQUEST_LIMIT_REACHED");
  const Onboarding = require("../studentOnboarding/studentOnboarding.model"),
    Claim = require("../societyClaims/societyClaim.model"),
    onboarding = await Onboarding.findOne({ userId: user._id }).lean();
  if (onboarding && ["IN_PROGRESS", "CHANGES_REQUESTED"].includes(onboarding.status)) {
    if (await Claim.exists({ onboardingId: onboarding._id }))
      fail("Choose only one society journey during onboarding", 409, "ONBOARDING_JOURNEY_CONFLICT");
    if (await Request.exists({ userId: user._id }))
      fail("Only one initial membership request is allowed", 409, "ONBOARDING_INITIAL_REQUEST_EXISTS");
  }
  const e = await lifecycle.resolveJoinSocietyEligibility({
    userId: user._id,
    targetSocietyId: societyId,
  });
  if (!e.eligible) {
    const conflicts = {
      TARGET_SOCIETY_INACTIVE: "TARGET_SOCIETY_INACTIVE",
      ALREADY_ACTIVE_MEMBER: "ALREADY_ACTIVE_MEMBER",
      MAX_ACTIVE_SOCIETIES_REACHED: "MEMBERSHIP_LIMIT_REACHED",
      MEMBERSHIP_REQUEST_PENDING: "DUPLICATE_PENDING_REQUEST",
    };
    fail("Student is not eligible to join", 409, conflicts[e.reason] || "JOIN_SOCIETY_NOT_ELIGIBLE");
  }
  const role = await Role.findOne({
    code: "MEMBER",
    status: "ACTIVE",
    isAssignable: true,
    isStudentRole: true,
    scopeType: { $in: ["SOCIETY", "BOTH"] },
  });
  if (!role)
    fail("Default membership role is unavailable", 409, "ROLE_NOT_FOUND");
  const route = await routing.resolveClaimVerifiers({
    societyId,
    claimedRoleId: role._id,
    claimantUserId: user._id,
  });
  try {
    const req = await Request.create({
      userId: user._id,
      studentMasterId: student._id,
      societyId,
      requestedRoleId: role._id,
      requestedRoleCode: role.code,
      requestedRoleName: role.name,
      status: "PENDING",
      requestReason,
      studentMessage,
      verificationTargetUserIds: route.eligibleVerifierUserIds,
      verificationRouteType: route.routeType,
      metadata: { routingReason: route.reason },
    });
    events.publish("MEMBERSHIP_REQUEST_SUBMITTED", {
      userId: user._id,
      studentMasterId: student._id,
      metadata: {
        requestId: String(req._id),
        societyId: String(societyId),
        routeType: route.routeType,
        verificationTargetUserIds: route.eligibleVerifierUserIds.map(String),
      },
    });
    events.publish("MEMBERSHIP_REQUEST_ASSIGNED", {userId:user._id,studentMasterId:student._id,metadata:{requestId:String(req._id),societyId:String(societyId),verificationTargetUserIds:route.eligibleVerifierUserIds.map(String)}});
    return {
      request: req,
      eligibility: {
        ...e,
        activeSocietyCount: e.activeSocietyCount,
        remainingSlots: e.remainingSlots,
      },
    };
  } catch (x) {
    if (x.code === 11000)
      fail(
        "Membership request already exists",
        409,
        "DUPLICATE_PENDING_REQUEST"
      );
    throw x;
  }
};
const access = async (userId, id) => {
  if (!mongoose.Types.ObjectId.isValid(id))
    fail("Membership request not found", 404, "MEMBERSHIP_REQUEST_NOT_FOUND");
  const r = await Request.findById(id);
  if (!r)
    fail("Membership request not found", 404, "MEMBERSHIP_REQUEST_NOT_FOUND");
  if (
    String(r.userId) !== String(userId) &&
    !r.verificationTargetUserIds.some((x) => String(x) === String(userId))
  ) {
    const p = await authz.hasPermission({
      userId,
      permissionCode: "membership.request.view",
      societyId: r.societyId,
    });
    if (!p.allowed)
      fail("Membership scope forbidden", 403, "MEMBERSHIP_SCOPE_FORBIDDEN");
  }
  return r;
};
const list = async (q, page = 1, limit = 20) => {
  const [items, totalItems] = await Promise.all([
    populate(Request.find(q))
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Request.countDocuments(q),
  ]);
  return {
    items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};
const cancel = async (userId, id) => {
  const r = await Request.findOneAndUpdate(
    { _id: id, userId, status: { $in: ["SUBMITTED", "PENDING"] } },
    {
      $set: { status: "CANCELLED", decisionBy: userId, decisionAt: new Date() },
    },
    { returnDocument: "after" }
  );
  if (!r) {
    await access(userId, id);
    fail(
      "Request cannot be cancelled",
      409,
      "MEMBERSHIP_REQUEST_CANCEL_NOT_ALLOWED"
    );
  }
  events.publish("MEMBERSHIP_REQUEST_CANCELLED", {
    userId: r.userId,
    studentMasterId: r.studentMasterId,
    metadata: { requestId: String(r._id) },
  });
  return r;
};
const decide = async ({
  actorUserId,
  requestId,
  approvedRoleId,
  reason,
  remarks,
  approve,
}) => {
  const r = await access(actorUserId, requestId);
  if(String(r.userId)===String(actorUserId))fail("You cannot review your own request",403,"SELF_APPROVAL_FORBIDDEN");
  const decisionPermission = await authz.hasPermission({
    userId: actorUserId,
    permissionCode: approve
      ? "membership.request.approve"
      : "membership.request.reject",
    societyId: r.societyId,
  });
  if (
    !decisionPermission.allowed ||
    (!r.verificationTargetUserIds.some(
      (x) => String(x) === String(actorUserId)
    ) &&
      !decisionPermission.allowed)
  )
    fail("Membership scope forbidden", 403, "MEMBERSHIP_SCOPE_FORBIDDEN");
  if (r.status !== "PENDING") {
    if (approve && r.status === "APPROVED") return r;
    fail(
      "Request decision already made",
      409,
      "MEMBERSHIP_REQUEST_DECISION_ALREADY_MADE"
    );
  }
  if (!approve && !reason)
    fail(
      "Rejection reason required",
      400,
      "MEMBERSHIP_REQUEST_REJECTION_REASON_REQUIRED"
    );
  let role = null;
  if (approve) {
    role = approvedRoleId
      ? await Role.findById(approvedRoleId)
      : await Role.findById(r.requestedRoleId);
    if (
      !role ||
      role.status !== "ACTIVE" ||
      !role.isAssignable ||
      !role.isStudentRole ||
      !["SOCIETY", "BOTH"].includes(role.scopeType)
    )
      fail("Approved role is invalid", 400, "ROLE_ASSIGNMENT_SCOPE_INVALID");
    if (String(role._id) !== String(r.requestedRoleId)) {
      const p = await authz.hasPermission({
        userId: actorUserId,
        permissionCode: "membership.request.approve_role_override",
        societyId: r.societyId,
      });
      if (!p.allowed) fail("Role override forbidden", 403, "PERMISSION_DENIED");
    }
    const eligibility = await lifecycle.resolveJoinSocietyEligibility({
      userId: r.userId,
      targetSocietyId: r.societyId,
    });
    if (
      eligibility.alreadyMember ||
      eligibility.activeSocietyCount >= eligibility.maximumActiveSocieties
    )
      fail(
        "Membership cannot be approved",
        409,
        eligibility.alreadyMember
          ? "MEMBERSHIP_ALREADY_ACTIVE"
          : "MEMBERSHIP_LIMIT_REACHED"
      );
  }
  const changed = await Request.findOneAndUpdate(
    { _id: r._id, status: "PENDING" },
    {
      $set: {
        status: approve ? "APPROVED" : "REJECTED",
        decisionBy: actorUserId,
        decisionAt: new Date(),
        decisionReason: reason,
        decisionRemarks: remarks,
        ...(role
          ? {
              approvedRoleId: role._id,
              approvedRoleCode: role.code,
              approvedRoleName: role.name,
            }
          : {}),
      },
    },
    { returnDocument: "after" }
  );
  if (!changed) {
    const latest=await Request.findById(r._id);
    if(approve&&latest?.status==="APPROVED")return latest;
    fail("Request decision already made",409,"MEMBERSHIP_REQUEST_DECISION_ALREADY_MADE");
  }
  if (approve) {
    const user = await User.findById(r.userId);
    const membership = await lifecycle.createMembership({
      userId: r.userId,
      studentMasterId: r.studentMasterId,
      societyId: r.societyId,
      roleId: role._id,
      startDate: new Date(),
      membershipSource: "JOIN_REQUEST",
      linkedMembershipRequestId: r._id,
    });
    changed.membershipId = membership._id;
    await changed.save();
    events.publish("MEMBERSHIP_REQUEST_APPROVED", {
      userId: r.userId,
      studentMasterId: r.studentMasterId,
      metadata: {
        requestId: String(r._id),
        membershipId: String(membership._id), societyId: String(r.societyId), actorUserId: String(actorUserId), verificationTargetUserIds: r.verificationTargetUserIds.map(String),
      },
    });
  } else
    events.publish("MEMBERSHIP_REQUEST_REJECTED", {
      userId: r.userId,
      studentMasterId: r.studentMasterId,
      metadata: { requestId: String(r._id), societyId: String(r.societyId), actorUserId: String(actorUserId), verificationTargetUserIds: r.verificationTargetUserIds.map(String), reason },
    });
  return changed;
};
const requestClarification=async({actorUserId,requestId,reason,remarks})=>{const r=await access(actorUserId,requestId);if(String(r.userId)===String(actorUserId))fail("You cannot review your own request",403,"SELF_APPROVAL_FORBIDDEN");const permission=await authz.hasPermission({userId:actorUserId,permissionCode:"membership.request.reject",societyId:r.societyId});if(!permission.allowed)fail("Membership scope forbidden",403,"MEMBERSHIP_SCOPE_FORBIDDEN");if(r.status!=="PENDING")fail("Request decision already made",409,"MEMBERSHIP_REQUEST_DECISION_ALREADY_MADE");if(!reason)fail("Clarification reason required",400,"MEMBERSHIP_REQUEST_REJECTION_REASON_REQUIRED");const changed=await Request.findOneAndUpdate({_id:r._id,status:"PENDING"},{$set:{status:"CLARIFICATION_REQUESTED",decisionBy:actorUserId,decisionAt:new Date(),decisionReason:reason,decisionRemarks:remarks}},{returnDocument:"after"});if(!changed)fail("Request decision already made",409,"MEMBERSHIP_REQUEST_DECISION_ALREADY_MADE");events.publish("MEMBERSHIP_REQUEST_CLARIFICATION_REQUESTED",{userId:r.userId,studentMasterId:r.studentMasterId,metadata:{requestId:String(r._id),reason}});return changed};
const resubmit=async(userId,requestId,{requestReason,studentMessage})=>{const changed=await Request.findOneAndUpdate({_id:requestId,userId,status:"CLARIFICATION_REQUESTED"},{$set:{status:"PENDING",requestReason,studentMessage,decisionBy:null,decisionAt:null,decisionReason:null,decisionRemarks:null},$inc:{attemptNumber:1}},{returnDocument:"after",runValidators:true});if(!changed){const existing=await Request.findById(requestId);if(!existing||String(existing.userId)!==String(userId))fail("Membership request not found",404,"MEMBERSHIP_REQUEST_NOT_FOUND");fail("Request cannot be resubmitted",409,"REQUEST_NOT_RESUBMITTABLE")}events.publish("MEMBERSHIP_REQUEST_ASSIGNED",{userId,studentMasterId:changed.studentMasterId,metadata:{requestId:String(changed._id),societyId:String(changed.societyId)}});return changed};
const oid=value=>value instanceof mongoose.Types.ObjectId?value:new mongoose.Types.ObjectId(String(value));
const assignedFilter=(userId,f={},defaultPending=true)=>({verificationTargetUserIds:oid(userId),...(f.status?{status:f.status}:defaultPending?{status:"PENDING"}:{}),...(f.societyId?{societyId:oid(f.societyId)}:{}),...(f.roleId?{requestedRoleId:oid(f.roleId)}:{}),...(f.academicSession?{academicSession:f.academicSession}:{}),...((f.submittedFrom||f.submittedTo)?{updatedAt:{...(f.submittedFrom?{$gte:new Date(f.submittedFrom)}:{}),...(f.submittedTo?{$lte:new Date(`${f.submittedTo}T23:59:59.999Z`)}:{})}}:{})});
const assignedCounts=async(userId,filters={})=>{if(!filters||typeof filters!=="object"||filters instanceof mongoose.Types.ObjectId)filters={societyId:filters};const q=assignedFilter(userId,filters,false),rows=await Request.aggregate([{$match:q},{$group:{_id:"$status",count:{$sum:1}}}]);return Object.fromEntries(rows.map(x=>[x._id,x.count]))};
module.exports = {
  submit,
  get: (u, id) =>
    access(u, id).then((r) => populate(Request.findById(r._id)).lean()),
  my: (u, p, l) => list({ userId: u }, p, l),
  assigned: (u, p, l, f={}) => list(assignedFilter(u,f), p, l),
  assignedCounts,
  cancel,
  approve: (a) => decide({ ...a, approve: true }),
  reject: (a) => decide({ ...a, approve: false }),
  requestClarification,
  resubmit,
};
