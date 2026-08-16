const mongoose = require("mongoose"),
  AppError = require("../../common/errors/AppError"),
  Event = require("./event.model"),
  Counter = require("./eventCounter.model"),
  Audit = require("./eventAudit.model"),
  Membership = require("../societyMemberships/societyMembership.model"),
  Assignment = require("../userRoleAssignments/userRoleAssignment.model"),
  Society = require("../societies/society.model"),
  User = require("../users/user.model"),
  Venue = require("../infrastructure/venue.model"),
  academicSessions = require("../academicSessions/academicSession.service"),
  authz = require("../authorization/authorization.service"),
  events = require("../../common/events/domainEvent.service"),
  workflow = require("./eventWorkflow.service"),
  { MODES, SPEAKER_STATUSES, WORKFLOW_STAGES, LIVE_EVENT_REQUEST_STATUSES } = require("./event.constants"),
  settings = require("../portalSettings/portalSetting.service");
const fail = (message, status, code, fields) => {
    const error = new AppError(message, status, code);
    if (fields) error.fields = fields;
    throw error;
  },
  oid = (value) => mongoose.Types.ObjectId.isValid(value),
  time = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || ""),
  populate = (query) =>
    query
      .populate("societyId", "name code")
      .populate(
        "poc.studentMasterId",
        "name rollNumber branch year contactNumber profilePictureUrl"
      );
const accessContext = async (userId, societyId, permissionCode) => {
  if (!oid(societyId))
    fail("Society workspace is unavailable", 400, "INVALID_RESOURCE_ID");
  const now = new Date(),
    [society, membership, permission] = await Promise.all([
      Society.findOne({
        _id: societyId,
        status: "ACTIVE",
        isActive: { $ne: false },
      }).lean(),
      Membership.findOne({
        userId,
        societyId,
        status: "ACTIVE",
        isOngoing: true,
        startDate: { $lte: now },
        $or: [
          { endDate: null },
          { endDate: { $exists: false } },
          { endDate: { $gt: now } },
        ],
      }).lean(),
      authz.hasPermission({ userId, societyId, permissionCode }),
    ]);
  if (!society)
    fail("Society workspace is unavailable", 404, "SOCIETY_NOT_FOUND");
  if (!membership)
    fail("Active society membership required", 403, "EVENT_CONTEXT_REQUIRED");
  const assignment =
    membership.linkedUserRoleAssignmentId &&
    (await Assignment.findOne({
      _id: membership.linkedUserRoleAssignmentId,
      userId,
      societyId,
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
    }).lean());
  if (!assignment)
    fail(
      "Active society role assignment required",
      403,
      "EVENT_CONTEXT_REQUIRED"
    );
  if (!permission.allowed)
    fail("Event permission denied", 403, "EVENT_PERMISSION_DENIED");
  return { society, membership, assignment };
};
const societyReadAccess = async (userId, societyId) => {
  if (!oid(societyId))
    fail("Society workspace is unavailable", 400, "INVALID_RESOURCE_ID");
  const [society, permission] = await Promise.all([
    Society.findOne({
      _id: societyId,
      status: "ACTIVE",
      isActive: { $ne: false },
    }).lean(),
    authz.hasPermission({
      userId,
      societyId,
      permissionCode: "event.list_society",
    }),
  ]);
  if (!society)
    fail("Society workspace is unavailable", 404, "SOCIETY_NOT_FOUND");
  if (!permission.allowed)
    fail("Event permission denied", 403, "EVENT_PERMISSION_DENIED");
};
const nextCode = async () => {
  const row = await Counter.findOneAndUpdate(
    { _id: "EVENT" },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return { eventNumber: row.value, eventCode: `EA${row.value}` };
};
const facultyContext = async (societyId) => {
  const presidents = await workflow.resolveReviewers(
    WORKFLOW_STAGES.FACULTY_REVIEW,
    societyId
  );
  return {
    eligiblePresidentUserIds: presidents.map((x) => x._id),
    presidentNames: presidents.map((x) => x.displayName),
  };
};
const numeric = (value) =>
    value === "" || value === null || value === undefined
      ? 0
      : Number.isFinite(Number(value))
      ? Number(value)
      : 0,
  normalize = (data) => {
    const budgetItems = (data.budget?.items || []).map((item, index) => ({
      ...item,
      quantity: numeric(item.quantity),
      estimatedUnitCost: numeric(item.estimatedUnitCost),
      estimatedAmount: numeric(item.quantity) * numeric(item.estimatedUnitCost),
      order: index,
    }));
    return {
      title: data.title?.trim() || undefined,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      dailySchedule: (data.dailySchedule || []).map((row) => ({
        date: row.date || null,
        startTime: row.startTime || "",
        endTime: row.endTime || "",
      })),
      venueRequirement: {
        required: Boolean(data.venueRequirement?.required),
        preferredVenueId: data.venueRequirement?.preferredVenueId || undefined,
        preferredVenueName:
          data.venueRequirement?.preferredVenueName?.trim() || undefined,
        notes: data.venueRequirement?.notes?.trim() || undefined,
      },
      objective: data.objective?.trim() || undefined,
      annexure: {
        ...(data.annexure || {}),
        concept: data.annexure?.concept?.trim() || undefined,
        targetAudience: data.annexure?.targetAudience?.trim() || undefined,
        expectedOutcomes: data.annexure?.expectedOutcomes?.trim() || undefined,
        speakers: (data.annexure?.speakers || []).map((item) => ({
          ...item,
          name: item.name?.trim() || undefined,
          designation: item.designation?.trim() || undefined,
          affiliation: item.affiliation?.trim() || undefined,
        })),
        eventFlow: (data.annexure?.eventFlow || []).map((item, index) => ({
          ...item,
          component: item.component?.trim() || undefined,
          description: item.description?.trim() || undefined,
          order: index,
        })),
      },
      previousEvents: (data.previousEvents || []).map((item) => ({
        ...item,
        title: item.title?.trim() || undefined,
        budgetUsed: numeric(item.budgetUsed),
        budgetLeft: numeric(item.budgetLeft),
      })),
      budget: {
        ...(data.budget || {}),
        unusedPrevious: numeric(data.budget?.unusedPrevious),
        sponsorshipAmount: numeric(data.budget?.sponsorshipAmount),
        balance: numeric(data.budget?.balance),
        currentRequirement: numeric(data.budget?.currentRequirement),
        items: budgetItems,
        totalEstimated: budgetItems.reduce(
          (sum, item) => sum + item.estimatedAmount,
          0
        ),
      },
      poc: data.poc || {},
    };
  };
const draftFields = (data) => {
  const fields = [],
    add = (field, message) => fields.push({ field, message }),
    validDate = (value) => !value || !Number.isNaN(new Date(value).getTime()),
    numberFields = [
      ["budget.unusedPrevious", data.budget?.unusedPrevious],
      ["budget.sponsorshipAmount", data.budget?.sponsorshipAmount],
      ["budget.balance", data.budget?.balance],
      ["budget.currentRequirement", data.budget?.currentRequirement],
    ];
  if (!validDate(data.startDate)) add("startDate", "Start date is invalid.");
  if (!validDate(data.endDate)) add("endDate", "End date is invalid.");
  if (
    data.startDate &&
    data.endDate &&
    new Date(data.endDate) < new Date(data.startDate)
  )
    add("endDate", "End date cannot precede start date.");
  if (data.dailySchedule !== undefined && !Array.isArray(data.dailySchedule))
    add("dailySchedule", "Daily schedule must be a list.");
  else
    (data.dailySchedule || []).forEach((row, index) => {
      if (!row || typeof row !== "object")
        return add(`dailySchedule.${index}`, "Schedule entry is malformed.");
      if (row.date && !validDate(row.date))
        add(`dailySchedule.${index}.date`, "Schedule date is invalid.");
      if (row.startTime && !time(row.startTime))
        add(`dailySchedule.${index}.startTime`, "Start time is invalid.");
      if (row.endTime && !time(row.endTime))
        add(`dailySchedule.${index}.endTime`, "End time is invalid.");
      if (
        row.startTime &&
        row.endTime &&
        time(row.startTime) &&
        time(row.endTime) &&
        row.endTime <= row.startTime
      )
        add(
          `dailySchedule.${index}.endTime`,
          "End time must be later than start time."
        );
    });
  if (data.annexure?.mode && !Object.values(MODES).includes(data.annexure.mode))
    add("annexure.mode", "Participation mode is invalid.");
  (data.annexure?.speakers || []).forEach((speaker, index) => {
    if (
      speaker.approvalStatus &&
      !Object.values(SPEAKER_STATUSES).includes(speaker.approvalStatus)
    )
      add(
        `annexure.speakers.${index}.approvalStatus`,
        "Speaker approval status is invalid."
      );
  });
  (data.budget?.items || []).forEach((item, index) =>
    numberFields.push(
      [`budget.items.${index}.quantity`, item.quantity],
      [`budget.items.${index}.estimatedUnitCost`, item.estimatedUnitCost]
    )
  );
  (data.previousEvents || []).forEach((item, index) =>
    numberFields.push(
      [`previousEvents.${index}.budgetUsed`, item.budgetUsed],
      [`previousEvents.${index}.budgetLeft`, item.budgetLeft]
    )
  );
  numberFields.forEach(([field, value]) => {
    if (
      value !== "" &&
      value !== null &&
      value !== undefined &&
      !Number.isFinite(Number(value))
    )
      add(field, "A valid numeric value is required.");
  });
  return fields;
};
const validateDraft = (data) => {
  const fields = draftFields(data);
  if (fields.length)
    fail(
      "Event draft contains invalid values",
      400,
      "EVENT_DRAFT_INVALID",
      fields
    );
};
const dayStart = (value = new Date()) => { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; };
const proposalDateFields = (event, academicSession, now = new Date()) => {
  const fields = [], add = (field, message) => fields.push({ field, message }), today = dayStart(now), sessionEnd = dayStart(academicSession.endDate), start = event.startDate && dayStart(event.startDate), end = event.endDate && dayStart(event.endDate);
  if (start && start < today) add("startDate", "Event start date cannot be before today.");
  if (start && start > sessionEnd) add("startDate", "Event start date must fall within the current Academic Session.");
  if (end && start && end < start) add("endDate", "End date cannot precede start date.");
  if (end && end > sessionEnd) add("endDate", "Event end date must fall within the current Academic Session.");
  (event.dailySchedule || []).forEach((row, index) => { const date = row.date && dayStart(row.date); if (date && start && end && (date < start || date > end)) add(`dailySchedule.${index}.date`, "Schedule date must fall within the Event date range."); if (date && date < today) add(`dailySchedule.${index}.date`, "Schedule date cannot be before today."); });
  return fields;
};
const liveRequestUsage = async (userId, excludeEventId) => {
  const [limit, current] = await Promise.all([settings.getValue("event.max_live_requests_per_general_secretary"), Event.countDocuments({ createdByUserId: userId, status: { $in: LIVE_EVENT_REQUEST_STATUSES }, ...(excludeEventId ? { _id: { $ne: excludeEventId } } : {}) })]);
  return { limit, current, available: current < limit };
};
const audit = (event, action, actor, assignment, metadata = {}) =>
  Audit.create({
    eventId: event._id,
    action,
    actorUserId: actor,
    actorRoleAssignmentId: assignment,
    timestamp: new Date(),
    metadata,
  });
const create = async ({ user, student, data }) => {
  validateDraft(data);
  const [context, academicSession] = await Promise.all([
      accessContext(user._id, data.societyId, "event.create"),
      academicSessions.getCurrentAcademicSession({ required: true }),
    ]),
    sequence = await nextCode(),
    facultyReviewContext = await facultyContext(data.societyId);
  const dateFields = proposalDateFields(data, academicSession);
  if (dateFields.length) fail("Event proposal dates are invalid", 400, "EVENT_DATE_INVALID", dateFields);
  let venueSnapshot = {};
  if (data.venueRequirement?.preferredVenueId) {
    const venue = await Venue.findOne({ _id: data.venueRequirement.preferredVenueId, status: "ACTIVE", bookingEnabled: true }).populate("buildingId", "name status").lean();
    if (!venue || !venue.buildingId || venue.buildingId.status !== "ACTIVE") fail("Selected venue is unavailable", 409, "EVENT_VENUE_UNAVAILABLE");
    venueSnapshot = { preferredVenueId: venue._id, preferredVenueName: venue.name, buildingNameSnapshot: venue.buildingId.name, venueTypeSnapshot: venue.venueType };
  }
  const
    event = await Event.create({
      ...sequence,
      ...normalize(data),
      societyId: data.societyId,
      academicSessionId: academicSession._id,
      academicSession: academicSession.name,
      venueRequirement: { ...normalize(data).venueRequirement, ...venueSnapshot },
      createdByUserId: user._id,
      createdByMembershipId: context.membership._id,
      createdFromRoleAssignmentId: context.assignment._id,
      createdByAssignmentId: context.assignment._id,
      poc: {
        studentMasterId: student?._id,
        label: data.poc?.label || "GENERAL_SECRETARY",
      },
      facultyReviewContext,
    });
  await audit(event, "EVENT_CREATED", user._id, context.assignment._id);
  return populate(Event.findById(event._id)).lean();
};
const owned = async (userId, id, permission = "event.view") => {
  if (!oid(id)) fail("Event not found", 404, "EVENT_NOT_FOUND");
  const event = await Event.findById(id);
  if (!event) fail("Event not found", 404, "EVENT_NOT_FOUND");
  await accessContext(userId, event.societyId, permission);
  return event;
};
const update = async (userId, id, data) => {
  const event = await owned(userId, id, "event.edit_own");
  if (
    !["DRAFT", "CHANGES_REQUESTED"].includes(event.status) ||
    String(event.createdByUserId) !== String(userId)
  )
    fail("Submitted event is read-only", 409, "EVENT_NOT_EDITABLE");
  validateDraft(data);
  const protectedPoc = event.poc?.toObject
    ? event.poc.toObject()
    : { ...(event.poc || {}) };
  if (!protectedPoc?.studentMasterId) {
    const owner = await User.findById(userId).select("studentMasterId").lean();
    if (owner?.studentMasterId)
      protectedPoc.studentMasterId = owner.studentMasterId;
  }
  const normalized = normalize({ ...event.toObject(), ...data });
  normalized.poc = protectedPoc;
  Object.assign(event, normalized);
  if (!event.createdByAssignmentId && event.createdFromRoleAssignmentId)
    event.createdByAssignmentId = event.createdFromRoleAssignmentId;
  await event.save();
  await audit(
    event,
    event.status === "DRAFT"
      ? "EVENT_DRAFT_UPDATED"
      : "EVENT_CORRECTION_UPDATED",
    userId,
    event.createdFromRoleAssignmentId
  );
  return populate(Event.findById(event._id)).lean();
};
const submissionFields = (event) => {
  const fields = [],
    add = (field, message) => {
      if (!fields.some((item) => item.field === field))
        fields.push({ field, message });
    };
  if (!event.title) add("title", "Event title is required.");
  if (!event.startDate) add("startDate", "Start date is required.");
  if (!event.endDate) add("endDate", "End date is required.");
  if (event.startDate && event.endDate && event.endDate < event.startDate)
    add("endDate", "End date cannot precede start date.");
  if (!event.dailySchedule.length)
    add("dailySchedule", "Please configure daily timing for every event date.");
  for (const [index, row] of event.dailySchedule.entries()) {
    if (!row.date)
      add(`dailySchedule.${index}.date`, "A schedule date is required.");
    if (!time(row.startTime))
      add(
        `dailySchedule.${index}.startTime`,
        "A valid start time is required."
      );
    if (!time(row.endTime) || row.endTime <= row.startTime)
      add(
        `dailySchedule.${index}.endTime`,
        "End time must be later than start time."
      );
  }
  if (!event.objective) add("objective", "Event objective is required.");
  if (!event.annexure?.concept)
    add("annexure.concept", "Event concept is required.");
  if (!event.annexure?.mode)
    add("annexure.mode", "Participation mode is required.");
  if (!event.annexure?.targetAudience)
    add("annexure.targetAudience", "Target audience is required.");
  if (!event.annexure?.expectedOutcomes)
    add("annexure.expectedOutcomes", "Expected outcomes are required.");
  if (!event.annexure?.eventFlow?.length)
    add("annexure.eventFlow", "Please add at least one Event Flow component.");
  else
    event.annexure.eventFlow.forEach((row, index) => {
      if (!row.component)
        add(
          `annexure.eventFlow.${index}.component`,
          "Event Flow component name is required."
        );
      if (!row.description)
        add(
          `annexure.eventFlow.${index}.description`,
          "Event Flow description is required."
        );
    });
  if (!event.poc?.studentMasterId)
    add("poc", "Authenticated Event POC identity is required.");
  return fields;
};
const submit = async (userId, id) => {
  const event = await owned(userId, id, "event.submit");
  if (!["DRAFT", "CHANGES_REQUESTED"].includes(event.status))
    return populate(Event.findById(event._id)).lean();
  if (String(event.createdByUserId) !== String(userId))
    fail(
      "Only the creator can submit this event",
      403,
      "EVENT_PERMISSION_DENIED"
    );
  const currentSession = await academicSessions.getCurrentAcademicSession({ required: true });
  const fields = [...submissionFields(event), ...proposalDateFields(event, currentSession)];
  if (String(event.academicSessionId) !== String(currentSession._id)) fields.push({ field: "academicSession", message: "Event proposals must use the current Academic Session." });
  if (fields.length)
    fail(
      "Event proposal is incomplete",
      400,
      "EVENT_SUBMISSION_INCOMPLETE",
      fields
    );
  const usage = await liveRequestUsage(userId, event._id);
  if (!usage.available) { const error = new AppError("You have reached the maximum number of active event requests allowed at one time.", 409, "EVENT_LIVE_REQUEST_LIMIT_REACHED"); error.metadata = { limit: usage.limit, current: usage.current }; throw error; }
  const stage =
    event.status === "CHANGES_REQUESTED"
      ? event.correctionStage
      : WORKFLOW_STAGES.FACULTY_REVIEW;
  const reviewers = await workflow.resolveReviewers(stage, event.societyId);
  if (!reviewers.length)
    fail(
      "No active Faculty President is currently assigned to this society.",
      409,
      "EVENT_REVIEWER_UNAVAILABLE",
      [
        {
          field: "facultyReview",
          message:
            "No active Faculty President is currently assigned to this society.",
        },
      ]
    );
  if (event.status === "CHANGES_REQUESTED") event.revision += 1;
  event.status = stage;
  event.currentStage = stage;
  event.correctionStage = undefined;
  event.submittedAt = new Date();
  event.submittedByUserId = userId;
  if (!event.originalSubmission)
    await Event.collection.updateOne(
      { _id: event._id, originalSubmission: { $exists: false } },
      { $set: { originalSubmission: normalize(event.toObject()) } }
    );
  if (stage === WORKFLOW_STAGES.FACULTY_REVIEW)
    event.facultyReviewContext = {
      eligiblePresidentUserIds: reviewers.map((x) => x._id),
      presidentNames: reviewers.map((x) => x.displayName),
    };
  await event.save();
  await audit(
    event,
    event.revision > 1 ? "EVENT_RESUBMITTED" : "EVENT_SUBMITTED",
    userId,
    event.createdFromRoleAssignmentId
  );
  events.publish(event.revision > 1 ? "EVENT_RESUBMITTED" : "EVENT_SUBMITTED", {
    userId,
    metadata: {
      eventId: String(event._id),
      eventCode: event.eventCode,
      societyId: String(event.societyId),
    },
  });
  await workflow.assign(event, stage, event.revision, reviewers);
  return get(userId, event._id);
};
const get = async (userId, id) => {
  const event = await owned(userId, id, "event.view");
  const visibility = await authz.hasPermission({ userId, societyId: event.societyId, permissionCode: "event.view" });
  if (
    event.status === "DRAFT" &&
    String(event.createdByUserId) !== String(userId) &&
    visibility.dataScope !== "ALL"
  )
    fail("Event not found", 404, "EVENT_NOT_FOUND");
  const value = await populate(Event.findById(event._id)).lean();
  if (event.status === "DRAFT")
    value.facultyReviewContext = await facultyContext(event.societyId);
  return {
    ...value,
    isCreator: String(event.createdByUserId) === String(userId),
    reviewHistory: await workflow.history(event._id),
    amendmentHistory: await workflow.amendments(event._id),
  };
};
const list = async (userId, societyId, filters = {}) => {
  await societyReadAccess(userId, societyId);
  const query = { societyId };
  if (filters.status) query.status = filters.status;
  else if (String(filters.excludeDrafts) === "true")
    query.status = { $ne: "DRAFT" };
  if (filters.from || filters.to)
    query.startDate = {
      ...(filters.from ? { $gte: new Date(filters.from) } : {}),
      ...(filters.to ? { $lte: new Date(filters.to) } : {}),
    };
  if (String(filters.excludeDrafts) !== "true")
    query.$or = [{ status: { $ne: "DRAFT" } }, { createdByUserId: userId }];
  const page = Number(filters.page || 1),
    limit = Math.min(100, Number(filters.limit || 20)),
    [items, totalItems] = await Promise.all([
      populate(Event.find(query))
        .sort({ startDate: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Event.countDocuments(query),
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
const listAll = async (filters = {}) => {
  const query = {};
  if (filters.societyId && oid(filters.societyId)) query.societyId = filters.societyId;
  if (filters.status) query.status = filters.status;
  if (filters.approvalStatus) query.approvalStatus = filters.approvalStatus;
  if (filters.from || filters.to)
    query.startDate = {
      ...(filters.from ? { $gte: new Date(filters.from) } : {}),
      ...(filters.to ? { $lte: new Date(filters.to) } : {}),
    };
  if (filters.search) {
    const escaped = String(filters.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { eventCode: { $regex: escaped, $options: "i" } },
      { title: { $regex: escaped, $options: "i" } },
    ];
  }
  const page = Number(filters.page || 1), limit = Math.min(100, Number(filters.limit || 20));
  const [items, totalItems] = await Promise.all([
    populate(Event.find(query)).sort({ startDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Event.countDocuments(query),
  ]);
  return { items, pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } };
};
module.exports = {
  proposalDateFields,
  liveRequestUsage,
  create,
  update,
  submit,
  get,
  list,
  listAll,
  nextCode,
  submissionFields,
  draftFields,
};
