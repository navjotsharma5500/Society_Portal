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
const budgets = require("../societyBudgets/societyBudget.service");
const {
  WORKFLOW_STAGES,
  resolveSanctionedBudgetAmount,
  recalculateBudgetItems,
  amendableFields,
  diffFields,
  describeChanges,
} = require("./event.constants");

// Assistant is permanently removed from the live Event approval routing. FACULTY_REVIEW now hands
// straight to DOSA_STAFF_REVIEW. ASSISTANT_REVIEW is intentionally absent from this table — any
// review still sitting on that legacy stage is unroutable and therefore never actionable again
// (see isWorkflowStage below), it only remains readable via history().
const routing = {
  FACULTY_REVIEW: { role: "PRESIDENT", next: "DOSA_STAFF_REVIEW" },
  DOSA_STAFF_REVIEW: { role: "DOSA_STAFF", next: "ADOSA_REVIEW" },
  ADOSA_REVIEW: { role: "ADOSA", next: "DOSA_REVIEW" },
  DOSA_REVIEW: { role: "DOSA", next: null },
};
// Active = currently routable stages (what new/live reviews may sit on). All = active + legacy
// (ASSISTANT_REVIEW), used only where historical records must remain visible.
const activeStageValues = Object.freeze(Object.keys(routing));
const allStageValues = Object.freeze(Object.values(WORKFLOW_STAGES));
const isWorkflowStage = (stage) => activeStageValues.includes(stage);
const TERMINAL_EVENT_STATUSES = Object.freeze(["APPROVED", "REJECTED", "CANCELLED"]);
// Marks every other PENDING review for an Event as SUPERSEDED (history-preserving, never deleted).
// Used (a) whenever a decide() outcome does NOT advance to a fresh next-stage review, so any
// leftover/duplicate PENDING review from bad prior state can never resurface as actionable, and
// (b) on Student resubmission, so a stale PENDING review from a superseded attempt can never be
// confused with the new attempt's FACULTY_REVIEW.
const supersedePendingReviews = (eventId, { exceptReviewId } = {}) =>
  Review.updateMany(
    {
      eventId,
      status: "PENDING",
      ...(exceptReviewId ? { _id: { $ne: exceptReviewId } } : {}),
    },
    { $set: { status: "SUPERSEDED" } }
  );
const reviewerLabel = (role) =>
  ({ DOSA_STAFF: "DoSA Staff", ADOSA: "ADoSA" }[role] || role.replaceAll("_", " "));
const amendmentChanges = (event, proposal = {}) => diffFields(event, proposal, amendableFields);
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
  if (!config)
    throw new AppError("Event approval stage is unavailable", 409, "EVENT_REVIEW_STAGE_UNAVAILABLE");
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
// History is an audit trail: it intentionally includes legacy (ASSISTANT_REVIEW) stages so old
// attempts remain fully readable, even though those stages can never be actionable again.
const history = (eventId) =>
  Review.find({ eventId, stage: { $in: allStageValues } })
    .sort({ attempt: 1, createdAt: 1 })
    .lean();
const amendments = async (eventId) => {
  const rows = await Amendment.find({ eventId }).sort({ revisionNumber: 1 }).lean();
  return rows.map((row) => ({ ...row, summary: describeChanges(row.changes) }));
};
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
  if (filters.stage && !isWorkflowStage(filters.stage))
    return {
      items: [],
      pagination: { page: 1, limit: 0, totalItems: 0, totalPages: 1 },
    };
  const query = { assignedReviewerUserIds: userId, stage: { $in: activeStageValues } };
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
  let items = rows.filter((x) => x.eventId);
  // The Pending queue means CURRENT ACTIONABLE ONLY: a PENDING review that belongs to an earlier
  // attempt, or whose stage no longer matches the Event's live currentStage/status, must never
  // surface here even if its own status column still (incorrectly) reads PENDING. Enforced
  // server-side — the frontend must not be relied on to filter this out.
  if (query.status === "PENDING")
    items = items.filter(
      (x) =>
        x.status === "PENDING" &&
        x.attempt === x.eventId.revision &&
        x.stage === x.eventId.currentStage &&
        x.stage === x.eventId.status
    );
  return {
    items,
    pagination: {
      page: 1,
      limit: items.length,
      totalItems: items.length,
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
  // Visibility (can this reviewer see the Event at all) intentionally includes legacy stages, so a
  // reviewer who was historically assigned a now-superseded/legacy review can still read the record
  // — only activeReview (below) is gated to the current actionable attempt.
  const assigned = await Review.exists({
    eventId,
    assignedReviewerUserIds: userId,
    stage: { $in: allStageValues },
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
  // activeReview must satisfy the full current-attempt invariant, never just "PENDING and assigned
  // to me" — otherwise a stale/duplicate PENDING review from an earlier attempt (or a legacy
  // ASSISTANT_REVIEW row) would surface reviewer action buttons on a historical attempt.
  const activeReview =
    reviewHistory.find(
      (x) =>
        x.status === "PENDING" &&
        x.attempt === event.revision &&
        x.stage === event.currentStage &&
        x.stage === event.status &&
        x.assignedReviewerUserIds.some((id) => String(id) === String(userId))
    ) || null;
  // DoSA Staff alone gets the exact Society budget position while actively reviewing — this is a
  // reviewer-only path (gated above by an assigned-reviewer check), never reachable by the student.
  let budgetPosition = null;
  if (activeReview?.stage === "DOSA_STAFF_REVIEW") {
    try {
      const societyBudget = await budgets.getCurrentBudget(event.societyId?._id || event.societyId, event.academicSession);
      const requestedAmount = event.budget?.totalEstimated || 0;
      const recommendedAmount = event.budget?.totalRecommended || 0;
      budgetPosition = {
        allocatedAmount: societyBudget.allocatedAmount,
        utilizedAmount: societyBudget.utilizedAmount,
        reservedAmount: societyBudget.reservedAmount,
        availableAmount: societyBudget.availableAmount,
        requestedAmount,
        recommendedAmount,
        projectedRemaining: societyBudget.availableAmount - (recommendedAmount > 0 ? recommendedAmount : requestedAmount),
      };
    } catch (error) {
      if (error?.code !== "BUDGET_NOT_FOUND") throw error;
      budgetPosition = { unavailable: true };
    }
  }
  return {
    ...event,
    reviewHistory,
    amendmentHistory: await amendments(eventId),
    activeReview,
    budgetPosition,
  };
};
const counts = async (userId, societyId) => {
  const match = {
    assignedReviewerUserIds: new mongoose.Types.ObjectId(String(userId)),
    stage: { $in: activeStageValues },
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
  if (!isWorkflowStage(current.stage))
    throw new AppError("Event approval stage is unavailable", 409, "EVENT_REVIEW_STAGE_UNAVAILABLE");
  if (
    !current.assignedReviewerUserIds.some((x) => String(x) === String(userId))
  )
    throw new AppError(
      "This event review is not assigned to you",
      403,
      "EVENT_REVIEW_FORBIDDEN"
    );
  const event = await Event.findById(current.eventId);
  if (!event) throw new AppError("Event not found", 404, "EVENT_NOT_FOUND");
  // Mandatory staleness gate — checked before ANY other decision logic, permission check, amendment
  // application, budget check, or state mutation. A review is only actionable when it is PENDING,
  // belongs to the Event's current approval attempt, and its stage still matches the Event's live
  // status/currentStage. This is what makes it impossible for a stale/duplicate review (e.g. the
  // legacy "DoSA Staff Request Changes + orphaned ADoSA PENDING" bug) to ever mutate an Event again
  // — including one that has already reached a terminal state (APPROVED/REJECTED/CANCELLED).
  if (
    current.status !== "PENDING" ||
    current.attempt !== event.revision ||
    event.status !== current.stage ||
    event.currentStage !== current.stage ||
    TERMINAL_EVENT_STATUSES.includes(event.status)
  )
    throw new AppError(
      "This review belongs to an earlier Event approval attempt and is no longer actionable.",
      409,
      "EVENT_REVIEW_STALE"
    );
  if (decision === "BUDGET_RECTIFICATION" && current.stage !== "DOSA_STAFF_REVIEW")
    throw new AppError(
      "Budget rectification can only be requested at the DoSA Staff stage",
      400,
      "EVENT_BUDGET_RECTIFICATION_INVALID_STAGE"
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
    : decision === "BUDGET_RECTIFICATION"
    ? "event.budget_review.rectify"
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
  // Hard block: DoSA Staff must not forward an Event whose effective amount (recommended, or
  // requested/estimated when no recommendation exists) exceeds the Society's CURRENT available
  // balance. Always re-fetched here — never trusts a value the client may have cached earlier.
  if (decision === "APPROVE" && current.stage === "DOSA_STAFF_REVIEW") {
    const effectiveAmount = resolveSanctionedBudgetAmount(event.budget);
    if (effectiveAmount > 0) {
      let availableAmount = 0;
      try {
        availableAmount = (await budgets.getCurrentBudget(event.societyId, event.academicSession)).availableAmount;
      } catch (error) {
        if (error?.code !== "BUDGET_NOT_FOUND") throw error;
      }
      if (effectiveAmount > availableAmount)
        throw new AppError(
          "The Event is over budget. Kindly check the budget requirement before forwarding.",
          409,
          "EVENT_BUDGET_EXCEEDS_AVAILABLE"
        );
    }
  }
  if (decision === "APPROVE" && next) {
    nextReviewers = await resolveReviewers(next, event.societyId);
    if (!nextReviewers.length)
      throw new AppError(
        `No active ${reviewerLabel(routing[next].role)} reviewer is configured.`,
        409,
        "EVENT_REVIEWER_UNAVAILABLE"
      );
  }
  const isFinalDosaApproval = decision === "APPROVE" && current.stage === "DOSA_REVIEW" && !next;
  let budgetPosting = null;
  if (isFinalDosaApproval) {
    const sanctionedAmount = resolveSanctionedBudgetAmount(event.budget);
    if (sanctionedAmount > 0) {
      try {
        budgetPosting = await budgets.utilizeEventBudget({
          societyId: event.societyId,
          academicSession: event.academicSession,
          eventId: event._id,
          amount: sanctionedAmount,
          reason: `Final DoSA approval budget utilization for Event ${event.eventCode}`,
          createdBy: userId,
        });
      } catch (error) {
        throw new AppError(
          `Event budget deduction failed: ${error.message}`,
          error.statusCode && error.statusCode < 500 ? error.statusCode : 502,
          "EVENT_BUDGET_DEDUCTION_FAILED"
        );
      }
    }
  }
  const updated = await Review.findOneAndUpdate(
    { _id: reviewId, status: "PENDING" },
    {
      $set: {
        status:
          decision === "APPROVE"
            ? "APPROVED"
            : decision === "REQUEST_CHANGES" || decision === "BUDGET_RECTIFICATION"
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
    if (amendment.budget?.items)
      event.budget.totalEstimated = recalculateBudgetItems(event.budget.items);
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
  } else if (decision === "BUDGET_RECTIFICATION") {
    event.status = "BUDGET_RECTIFICATION_REQUIRED";
    event.currentStage = "BUDGET_RECTIFICATION_REQUIRED";
    event.correctionStage = current.stage;
  } else if (decision === "REJECT") {
    event.status = "REJECTED";
    event.currentStage = "REJECTED";
  } else if (!next) {
    event.status = "APPROVED";
    event.currentStage = "APPROVED";
    if (budgetPosting) {
      event.budget.deductionStatus = "POSTED";
      event.budget.deductedAmount = budgetPosting.transaction.amount;
      event.budget.deductedAt = budgetPosting.transaction.createdAt || new Date();
      event.budget.societyBudgetId = budgetPosting.budget._id;
      event.budget.budgetTransactionId = budgetPosting.transaction._id;
    } else {
      event.budget.deductionStatus = "NOT_REQUIRED";
    }
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
      : decision === "BUDGET_RECTIFICATION"
      ? "EVENT_BUDGET_RECTIFICATION_REQUESTED"
      : "EVENT_REJECTED";
  await Audit.create({
    eventId: event._id,
    action,
    actorUserId: userId,
    metadata: {
      stage: current.stage,
      attempt: current.attempt,
      remarks,
      ...(budgetPosting
        ? { budgetTransactionId: String(budgetPosting.transaction._id), deductedAmount: budgetPosting.transaction.amount }
        : {}),
    },
  });
  domainEvents.publish(action, {
    userId,
    metadata: { eventId: String(event._id), stage: current.stage },
  });
  // Root-cause fix: a next-stage review may ONLY be assigned when this decision actually APPROVEd
  // and a next stage exists. `next` alone is just "what the routing table says comes after this
  // stage" — it says nothing about what was decided. Gating on `next` alone (the historical bug)
  // meant REQUEST_CHANGES / REJECT / BUDGET_RECTIFICATION also created a downstream review, so e.g.
  // a DoSA Staff "Request Changes" sent the Event back to the Student while simultaneously creating
  // a PENDING ADoSA review against the very attempt that was just rejected.
  if (decision === "APPROVE" && next) {
    await assign(event, next, event.revision, nextReviewers);
  } else {
    // REQUEST_CHANGES / REJECT / legacy BUDGET_RECTIFICATION (and, defensively, any other
    // non-advancing outcome) must create ZERO downstream reviews and must leave no other PENDING
    // review behind for this Event — this is what makes stale duplicate reviews impossible.
    await supersedePendingReviews(event._id, { exceptReviewId: reviewId });
  }
  return { review: updated, event, history: await history(event._id) };
};
const amend = async ({ userId, reviewId, reason, proposal }) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId))
    throw new AppError("Event review not found", 404, "EVENT_REVIEW_NOT_FOUND");
  const review = await Review.findOne({
    _id: reviewId,
    status: "PENDING",
    stage: { $in: allStageValues },
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
  if (review.stage !== "FACULTY_REVIEW")
    throw new AppError(
      "Assistant amendment is unavailable at this stage",
      409,
      "EVENT_REVIEW_STAGE_MISMATCH"
    );
  const event = await Event.findOne({
    _id: review.eventId,
    status: review.stage,
    currentStage: review.stage,
    revision: review.attempt,
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
  if (proposal.budget?.items)
    event.budget.totalEstimated = recalculateBudgetItems(event.budget.items);
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
  event.budget.totalEstimated = recalculateBudgetItems(event.budget.items);
  event.budget.totalRecommended = event.budget.items.reduce((sum, item) => sum + Number(item.recommendedAmount || 0), 0);
  event.budget.reviewedAt = new Date();
  event.budget.reviewedByUserId = userId;
  await event.save();
  await Audit.create({ eventId: event._id, action: "EVENT_BUDGET_REVIEW_SAVED", actorUserId: userId, metadata: { stage: review.stage, totalRequested: event.budget.totalEstimated, totalRecommended: event.budget.totalRecommended } });
  return { event };
};
module.exports = {
  routing,
  activeStageValues,
  allStageValues,
  isWorkflowStage,
  supersedePendingReviews,
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
