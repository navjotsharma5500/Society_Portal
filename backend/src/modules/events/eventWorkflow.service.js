const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Event = require("./event.model");
const Review = require("./eventReview.model");
const Amendment = require("./eventAmendment.model");
const Audit = require("./eventAudit.model");
const Assignment = require("../userRoleAssignments/userRoleAssignment.model");
const Role = require("../roles/role.model");
const User = require("../users/user.model");
const Society = require("../societies/society.model");
const authz = require("../authorization/authorization.service");
const domainEvents = require("../../common/events/domainEvent.service");
const { WORKFLOW_STAGES } = require("./event.constants");

const routing = {
  FACULTY_REVIEW: { role: "PRESIDENT", next: "ASSISTANT_REVIEW" },
  ASSISTANT_REVIEW: { role: "ASSISTANT", next: "DOSA_STAFF_REVIEW" },
  DOSA_STAFF_REVIEW: { role: "DOSA_STAFF", next: "ADOSA_REVIEW" },
  ADOSA_REVIEW: { role: "ADOSA", next: "DOSA_REVIEW" },
  ADMIN_REVIEW: { role: "ADMIN", next: "DOSA_REVIEW" },
  DOSA_REVIEW: { role: "DOSA", next: null },
};
const reviewerLabel = (role) =>
  ({ DOSA_STAFF: "DoSA Staff", ADOSA: "ADoSA" }[role] || role.replaceAll("_", " "));
const amendableFields = [
  "title",
  "startDate",
  "endDate",
  "dailySchedule",
  "venueRequirement",
  "objective",
  "annexure",
  "previousEvents",
  "budget",
];
const plain = (value) => JSON.parse(JSON.stringify(value ?? null));
const amendmentChanges = (event, proposal = {}) =>
  amendableFields
    .filter(
      (field) =>
        Object.prototype.hasOwnProperty.call(proposal, field) &&
        JSON.stringify(plain(event[field])) !==
          JSON.stringify(plain(proposal[field]))
    )
    .map((field) => ({
      fieldPath: field,
      oldValue: plain(event[field]),
      newValue: plain(proposal[field]),
    }));
const activeWindow = (now = new Date()) => ({
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
});
const resolveReviewers = async (stage, societyId) => {
  const config = routing[stage];
  const role = await Role.findOne({
    code: config.role,
    status: "ACTIVE",
  }).lean();
  if (!role) return [];
  const query = { roleId: role._id, ...activeWindow() };
  if (stage === WORKFLOW_STAGES.FACULTY_REVIEW)
    Object.assign(query, { scopeType: "SOCIETY", societyId });
  else Object.assign(query, { scopeType: "GLOBAL", societyId: null });
  const assignments = await Assignment.find(query).lean();
  const users = await User.find({
    _id: { $in: assignments.map((x) => x.userId) },
    status: "ACTIVE",
    isLoginAllowed: { $ne: false },
  })
    .select("_id displayName")
    .lean();
  return users;
};
const assign = async (
  event,
  stage,
  attempt = event.revision || 1,
  reviewers
) => {
  const eligible =
    reviewers || (await resolveReviewers(stage, event.societyId));
  if (!eligible.length)
    throw new AppError(
      `No active ${reviewerLabel(routing[stage].role)} reviewer is configured.`,
      409,
      "EVENT_REVIEWER_UNAVAILABLE"
    );
  let review;
  try {
    review = await Review.create({
      eventId: event._id,
      stage,
      assignedReviewerUserIds: eligible.map((x) => x._id),
      assignedRoleCode: routing[stage].role,
      attempt,
    });
  } catch (error) {
    if (error?.code === 11000)
      return Review.findOne({ eventId: event._id, stage, attempt });
    throw error;
  }
  await Audit.create({
    eventId: event._id,
    action: "EVENT_STAGE_ASSIGNED",
    actorUserId: event.submittedByUserId || event.createdByUserId,
    metadata: { stage, attempt, reviewerCount: eligible.length },
  });
  domainEvents.publish("EVENT_REVIEW_ASSIGNED", {
    userId: event.createdByUserId,
    metadata: {
      eventId: String(event._id),
      stage,
      reviewerCount: eligible.length,
      targetUserIds: eligible.map((user) => String(user._id)),
      societyId: String(event.societyId),
    },
  });
  return review;
};
const history = (eventId) =>
  Review.find({ eventId }).sort({ attempt: 1, createdAt: 1 }).lean();
const amendments = (eventId) =>
  Amendment.find({ eventId }).sort({ revisionNumber: 1 }).lean();
const queue = async (userId, filters = {}) => {
  const queuePermission = await authz.hasPermission({
    userId,
    societyId: filters.societyId,
    permissionCode: "event.review.queue.view",
  });
  if (filters.societyId && !queuePermission.allowed)
    throw new AppError(
      "Event review queue permission denied",
      403,
      "EVENT_PERMISSION_DENIED"
    );
  const query = { assignedReviewerUserIds: userId };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (filters.view === "forwarded") {
    query.decision = "APPROVE";
    query.decidedByUserId = userId;
  }
  if (filters.view === "completed") query.decidedByUserId = userId;
  if (filters.status) query.status = filters.status;
  if (filters.stage) query.stage = filters.stage;
  const eventMatch =
    filters.societyId && mongoose.Types.ObjectId.isValid(filters.societyId)
      ? { societyId: filters.societyId }
      : {};
  if (filters.view === "completed") eventMatch.endDate = { $lt: today };
  if (filters.view === "forwarded")
    eventMatch.$or = [{ endDate: { $gte: today } }, { endDate: null }];
  const rows = await Review.find(query)
    .populate({
      path: "eventId",
      match: eventMatch,
      populate: { path: "societyId", select: "name code" },
    })
    .sort({ updatedAt: -1 })
    .lean();
  return {
    items: rows.filter((x) => x.eventId),
    pagination: {
      page: 1,
      limit: rows.length,
      totalItems: rows.filter((x) => x.eventId).length,
      totalPages: 1,
    },
  };
};
const detail = async (userId, eventId) => {
  if (!mongoose.Types.ObjectId.isValid(eventId))
    throw new AppError("Event not found", 404, "EVENT_NOT_FOUND");
  const event = await Event.findById(eventId)
    .populate("societyId", "name code")
    .populate(
      "poc.studentMasterId",
      "name rollNumber branch year contactNumber profilePictureUrl"
    )
    .lean();
  if (!event || event.status === "DRAFT")
    throw new AppError("Event not found", 404, "EVENT_NOT_FOUND");
  const assigned = await Review.exists({
    eventId,
    assignedReviewerUserIds: userId,
  });
  const allowed = await authz.hasPermission({
    userId,
    societyId: event.societyId?._id,
    permissionCode: "event.review.view",
  });
  if (!assigned || !allowed.allowed)
    throw new AppError(
      "Event review permission denied",
      403,
      "EVENT_PERMISSION_DENIED"
    );
  const reviewHistory = await history(eventId);
  const activeReview =
    reviewHistory.find(
      (x) =>
        x.status === "PENDING" &&
        x.assignedReviewerUserIds.some((id) => String(id) === String(userId))
    ) || null;
  return {
    ...event,
    reviewHistory,
    amendmentHistory: await amendments(eventId),
    activeReview,
  };
};
const counts = async (userId, societyId) => {
  const match = {
    assignedReviewerUserIds: new mongoose.Types.ObjectId(String(userId)),
  };
  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: "events",
        localField: "eventId",
        foreignField: "_id",
        as: "event",
      },
    },
    { $unwind: "$event" },
  ];
  if (societyId && mongoose.Types.ObjectId.isValid(societyId))
    pipeline.push({
      $match: { "event.societyId": new mongoose.Types.ObjectId(societyId) },
    });
  pipeline.push({ $group: { _id: "$status", count: { $sum: 1 } } });
  return Object.fromEntries(
    (await Review.aggregate(pipeline)).map((x) => [x._id, x.count])
  );
};
const decide = async ({ userId, reviewId, decision, remarks, amendment }) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId))
    throw new AppError("Event review not found", 404, "EVENT_REVIEW_NOT_FOUND");
  const current = await Review.findById(reviewId).lean();
  if (!current)
    throw new AppError("Event review not found", 404, "EVENT_REVIEW_NOT_FOUND");
  if (
    !current.assignedReviewerUserIds.some((x) => String(x) === String(userId))
  )
    throw new AppError(
      "This event review is not assigned to you",
      403,
      "EVENT_REVIEW_FORBIDDEN"
    );
  const event = await Event.findById(current.eventId);
  if (current.stage === "ASSISTANT_REVIEW" && amendment)
    throw new AppError(
      "Assistant cannot amend Event proposal data",
      403,
      "EVENT_PERMISSION_DENIED"
    );
  const changes = amendmentChanges(event, amendment);
  if (changes.length && decision !== "APPROVE")
    throw new AppError(
      "Amendments may only be saved while forwarding",
      400,
      "EVENT_AMENDMENT_DECISION_INVALID"
    );
  if (changes.length && !String(remarks || "").trim())
    throw new AppError(
      "A reason is required for reviewer amendments",
      400,
      "EVENT_AMENDMENT_REASON_REQUIRED"
    );
  const permission = changes.length
    ? "event.review.amend"
    : decision === "APPROVE"
    ? current.stage === "DOSA_REVIEW"
      ? "event.review.final_approve"
      : "event.review.forward"
    : decision === "REQUEST_CHANGES"
    ? "event.review.request_changes"
    : "event.review.reject";
  if (
    !(
      await authz.hasPermission({
        userId,
        societyId:
          current.stage === "FACULTY_REVIEW" ? event.societyId : undefined,
        permissionCode: permission,
      })
    ).allowed
  )
    throw new AppError(
      "Event review permission denied",
      403,
      "EVENT_PERMISSION_DENIED"
    );
  if (decision !== "APPROVE" && !String(remarks || "").trim())
    throw new AppError(
      "Remarks are required",
      400,
      "EVENT_REVIEW_REMARKS_REQUIRED"
    );
  if (String(event.createdByUserId) === String(userId))
    throw new AppError(
      "Creators cannot review their own event",
      403,
      "EVENT_SELF_REVIEW_FORBIDDEN"
    );
  let nextReviewers = null;
  const next = routing[current.stage].next;
  if (
    decision === "APPROVE" &&
    current.stage === "DOSA_STAFF_REVIEW" &&
    event.budget.items.some((item) => item.recommendedAmount == null)
  )
    throw new AppError(
      "Complete the item-wise budget review before forwarding",
      400,
      "EVENT_BUDGET_REVIEW_INCOMPLETE"
    );
  if (decision === "APPROVE" && next) {
    nextReviewers = await resolveReviewers(next, event.societyId);
    if (!nextReviewers.length)
      throw new AppError(
        `No active ${reviewerLabel(routing[next].role)} reviewer is configured.`,
        409,
        "EVENT_REVIEWER_UNAVAILABLE"
      );
  }
  const updated = await Review.findOneAndUpdate(
    { _id: reviewId, status: "PENDING" },
    {
      $set: {
        status:
          decision === "APPROVE"
            ? "APPROVED"
            : decision === "REQUEST_CHANGES"
            ? "CHANGES_REQUESTED"
            : "REJECTED",
        decision,
        remarks: String(remarks || "").trim(),
        decidedByUserId: userId,
        decidedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );
  if (!updated)
    throw new AppError(
      "This event review has already been decided",
      409,
      "EVENT_REVIEW_ALREADY_DECIDED"
    );
  if (changes.length) {
    event.amendmentRevision += 1;
    for (const change of changes) event.set(change.fieldPath, change.newValue);
    if (amendment.budget?.items) {
      event.budget.items.forEach((item, index) => {
        item.estimatedAmount =
          Number(item.quantity || 0) * Number(item.estimatedUnitCost || 0);
        item.order = index;
      });
      event.budget.totalEstimated = event.budget.items.reduce(
        (sum, item) => sum + Number(item.estimatedAmount || 0),
        0
      );
    }
    await Amendment.create({
      eventId: event._id,
      workflowStage: current.stage,
      revisionNumber: event.amendmentRevision,
      changedByUserId: userId,
      changedByRoleCode: current.assignedRoleCode,
      reason: String(remarks).trim(),
      changes,
    });
    await Audit.create({
      eventId: event._id,
      action: "EVENT_AMENDED",
      actorUserId: userId,
      metadata: {
        stage: current.stage,
        revisionNumber: event.amendmentRevision,
        changedFields: changes.map((x) => x.fieldPath),
      },
    });
    domainEvents.publish("EVENT_AMENDED", {
      userId,
      metadata: {
        eventId: String(event._id),
        stage: current.stage,
        revisionNumber: event.amendmentRevision,
      },
    });
  }
  if (decision === "REQUEST_CHANGES") {
    event.status = "CHANGES_REQUESTED";
    event.currentStage = "CHANGES_REQUESTED";
    event.correctionStage = current.stage;
  } else if (decision === "REJECT") {
    event.status = "REJECTED";
    event.currentStage = "REJECTED";
  } else if (!next) {
    event.status = "APPROVED";
    event.currentStage = "APPROVED";
  } else {
    event.status = next;
    event.currentStage = next;
  }
  await event.save();
  const action =
    decision === "APPROVE"
      ? next
        ? "EVENT_FORWARDED"
        : "EVENT_FINAL_APPROVED"
      : decision === "REQUEST_CHANGES"
      ? "EVENT_CHANGES_REQUESTED"
      : "EVENT_REJECTED";
  await Audit.create({
    eventId: event._id,
    action,
    actorUserId: userId,
    metadata: { stage: current.stage, attempt: current.attempt, remarks },
  });
  domainEvents.publish(
    decision === "APPROVE"
      ? next
        ? "EVENT_FORWARDED"
        : "EVENT_FINAL_APPROVED"
      : decision === "REQUEST_CHANGES"
      ? "EVENT_CHANGES_REQUESTED"
      : "EVENT_REJECTED",
    { userId, metadata: { eventId: String(event._id), stage: current.stage } }
  );
  if (next) await assign(event, next, event.revision, nextReviewers);
  return { review: updated, event, history: await history(event._id) };
};
const amend = async ({ userId, reviewId, reason, proposal }) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId))
    throw new AppError("Event review not found", 404, "EVENT_REVIEW_NOT_FOUND");
  const review = await Review.findOne({
    _id: reviewId,
    status: "PENDING",
  }).lean();
  if (!review)
    throw new AppError(
      "This event review has already been decided",
      409,
      "EVENT_REVIEW_ALREADY_DECIDED"
    );
  if (
    !review.assignedReviewerUserIds.some((id) => String(id) === String(userId))
  )
    throw new AppError(
      "This event review is not assigned to you",
      403,
      "EVENT_REVIEW_FORBIDDEN"
    );
  if (review.stage === "ASSISTANT_REVIEW")
    throw new AppError(
      "Assistant cannot amend Event proposal data",
      403,
      "EVENT_PERMISSION_DENIED"
    );
  if (review.stage !== "FACULTY_REVIEW")
    throw new AppError(
      "Assistant amendment is unavailable at this stage",
      409,
      "EVENT_REVIEW_STAGE_MISMATCH"
    );
  const event = await Event.findOne({
    _id: review.eventId,
    status: review.stage,
  });
  if (!event)
    throw new AppError(
      "This event review has already been decided",
      409,
      "EVENT_REVIEW_ALREADY_DECIDED"
    );
  if (
    !(
      await authz.hasPermission({
        userId,
        permissionCode: "event.review.amend",
      })
    ).allowed
  )
    throw new AppError(
      "Event amendment permission denied",
      403,
      "EVENT_PERMISSION_DENIED"
    );
  const changes = amendmentChanges(event, proposal);
  if (!changes.length)
    throw new AppError(
      "No proposal changes were provided",
      400,
      "EVENT_AMENDMENT_EMPTY"
    );
  if (!String(reason || "").trim())
    throw new AppError(
      "A reason is required for reviewer amendments",
      400,
      "EVENT_AMENDMENT_REASON_REQUIRED"
    );
  event.amendmentRevision += 1;
  for (const change of changes) event.set(change.fieldPath, change.newValue);
  if (proposal.budget?.items) {
    event.budget.items.forEach((item, index) => {
      item.estimatedAmount =
        Number(item.quantity || 0) * Number(item.estimatedUnitCost || 0);
      item.order = index;
    });
    event.budget.totalEstimated = event.budget.items.reduce(
      (sum, item) => sum + Number(item.estimatedAmount || 0),
      0
    );
  }
  await event.save();
  const amendment = await Amendment.create({
    eventId: event._id,
    workflowStage: review.stage,
    revisionNumber: event.amendmentRevision,
    changedByUserId: userId,
    changedByRoleCode: review.assignedRoleCode,
    reason: String(reason).trim(),
    changes,
  });
  await Audit.create({
    eventId: event._id,
    action: "EVENT_AMENDED",
    actorUserId: userId,
    metadata: {
      stage: review.stage,
      revisionNumber: event.amendmentRevision,
      changedFields: changes.map((x) => x.fieldPath),
    },
  });
  domainEvents.publish("EVENT_AMENDED", {
    userId,
    metadata: {
      eventId: String(event._id),
      stage: review.stage,
      revisionNumber: event.amendmentRevision,
    },
  });
  return { event, amendment };
};
const saveBudgetReview = async ({ userId, reviewId, items }) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId))
    throw new AppError("Event review not found", 404, "EVENT_REVIEW_NOT_FOUND");
  const review = await Review.findOne({
    _id: reviewId,
    stage: "DOSA_STAFF_REVIEW",
    status: "PENDING",
    assignedReviewerUserIds: userId,
  }).lean();
  if (!review)
    throw new AppError("This budget review is not assigned to you", 403, "EVENT_REVIEW_FORBIDDEN");
  const event = await Event.findOne({ _id: review.eventId, status: review.stage });
  const permission = await authz.hasPermission({ userId, permissionCode: "event.budget_review.edit" });
  if (!event || !permission.allowed)
    throw new AppError("Event budget review permission denied", 403, "EVENT_PERMISSION_DENIED");
  if (!Array.isArray(items) || items.length !== event.budget.items.length)
    throw new AppError("A review is required for every budget item", 400, "EVENT_BUDGET_REVIEW_INVALID");
  event.budget.items.forEach((item, index) => {
    const input = items[index] || {};
    const amount = Number(input.recommendedAmount);
    if (!Number.isFinite(amount) || amount < 0)
      throw new AppError("Recommended amounts must be zero or greater", 400, "EVENT_BUDGET_REVIEW_INVALID");
    item.recommendedAmount = amount;
    item.recommendedQuantity = input.recommendedQuantity === "" || input.recommendedQuantity == null ? undefined : Number(input.recommendedQuantity);
    item.recommendedRate = input.recommendedRate === "" || input.recommendedRate == null ? undefined : Number(input.recommendedRate);
    item.reviewRemark = String(input.reviewRemark || "").trim();
  });
  event.budget.totalEstimated = event.budget.items.reduce((sum, item) => sum + Number(item.estimatedAmount || 0), 0);
  event.budget.totalRecommended = event.budget.items.reduce((sum, item) => sum + Number(item.recommendedAmount || 0), 0);
  event.budget.reviewedAt = new Date();
  event.budget.reviewedByUserId = userId;
  await event.save();
  await Audit.create({ eventId: event._id, action: "EVENT_BUDGET_REVIEW_SAVED", actorUserId: userId, metadata: { stage: review.stage, totalRequested: event.budget.totalEstimated, totalRecommended: event.budget.totalRecommended } });
  return { event };
};
module.exports = {
  routing,
  resolveReviewers,
  assign,
  history,
  amendments,
  queue,
  detail,
  counts,
  decide,
  amend,
  saveBudgetReview,
};
