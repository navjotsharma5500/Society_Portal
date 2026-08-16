const mongoose = require("mongoose"),
  {
    STATUSES,
    MODES,
    SPEAKER_STATUSES,
    PREVIOUS_SOURCES,
  } = require("./event.constants");
const schedule = new mongoose.Schema(
    {
      date: { type: Date, required: true },
      startTime: { type: String, required: true },
      endTime: { type: String, required: true },
    },
    { _id: false }
  ),
  speaker = new mongoose.Schema(
    {
      name: { type: String, trim: true, maxlength: 150 },
      designation: { type: String, trim: true, maxlength: 200 },
      affiliation: { type: String, trim: true, maxlength: 200 },
      approvalStatus: {
        type: String,
        enum: Object.values(SPEAKER_STATUSES),
        default: "PENDING",
      },
    },
    { _id: false }
  ),
  flow = new mongoose.Schema(
    {
      component: { type: String, trim: true, maxlength: 200 },
      description: { type: String, trim: true, maxlength: 2000 },
      order: { type: Number, min: 0 },
    },
    { _id: false }
  ),
  previous = new mongoose.Schema(
    {
      source: {
        type: String,
        enum: Object.values(PREVIOUS_SOURCES),
        default: "MANUAL",
      },
      sourceEventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event" },
      title: { type: String, trim: true, maxlength: 200 },
      startDate: Date,
      endDate: Date,
      budgetUsed: { type: Number, min: 0 },
      budgetLeft: { type: Number, min: 0 },
    },
    { _id: false }
  ),
  budgetItem = new mongoose.Schema(
    {
      head: { type: String, trim: true, maxlength: 200 },
      description: { type: String, trim: true, maxlength: 1000 },
      quantity: { type: Number, min: 0, default: 1 },
      estimatedUnitCost: { type: Number, min: 0, default: 0 },
      estimatedAmount: { type: Number, min: 0, default: 0 },
      recommendedQuantity: { type: Number, min: 0 },
      recommendedRate: { type: Number, min: 0 },
      recommendedAmount: { type: Number, min: 0 },
      reviewRemark: { type: String, trim: true, maxlength: 1000 },
      order: { type: Number, min: 0 },
    },
    { _id: false }
  );
const schema = new mongoose.Schema(
  {
    eventCode: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true,
    },
    eventNumber: {
      type: Number,
      required: true,
      unique: true,
      immutable: true,
      index: true,
    },
    societyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", index: true },
    academicSession: { type: String, trim: true, index: true },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdByMembershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocietyMembership",
      required: true,
    },
    createdFromRoleAssignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserRoleAssignment",
      required: true,
    },
    createdByAssignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserRoleAssignment",
      immutable: true,
    },
    title: { type: String, trim: true, maxlength: 200 },
    startDate: Date,
    endDate: Date,
    dailySchedule: { type: [schedule], default: [] },
    venueRequirement: {
      required: { type: Boolean, default: false },
      preferredVenueId: { type: mongoose.Schema.Types.ObjectId, ref: "Venue" },
      preferredVenueName: { type: String, trim: true, maxlength: 200 },
      buildingNameSnapshot: { type: String, trim: true, maxlength: 200 },
      venueTypeSnapshot: { type: String, trim: true, maxlength: 50 },
      notes: { type: String, trim: true, maxlength: 1000 },
    },
    objective: { type: String, trim: true, maxlength: 5000 },
    annexure: {
      concept: { type: String, trim: true, maxlength: 5000 },
      speakers: { type: [speaker], default: [] },
      mode: { type: String, enum: Object.values(MODES) },
      targetAudience: { type: String, trim: true, maxlength: 3000 },
      expectedOutcomes: { type: String, trim: true, maxlength: 3000 },
      eventFlow: { type: [flow], default: [] },
    },
    previousEvents: { type: [previous], default: [] },
    budget: {
      unusedPrevious: { type: Number, min: 0, default: 0 },
      sponsorshipAmount: { type: Number, min: 0, default: 0 },
      balance: { type: Number, min: 0, default: 0 },
      currentRequirement: { type: Number, min: 0, default: 0 },
      items: { type: [budgetItem], default: [] },
      totalEstimated: { type: Number, min: 0, default: 0 },
      totalRecommended: { type: Number, min: 0, default: 0 },
      reviewedAt: Date,
      reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    poc: {
      studentMasterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StudentMaster",
      },
      label: {
        type: String,
        enum: ["GENERAL_SECRETARY", "EVENT_HEAD"],
        default: "GENERAL_SECRETARY",
      },
    },
    facultyReviewContext: {
      eligiblePresidentUserIds: [
        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      ],
      presidentNames: { type: [String], default: [] },
    },
    status: {
      type: String,
      enum: Object.values(STATUSES),
      default: "DRAFT",
      index: true,
    },
    currentStage: { type: String, default: "DRAFT" },
    revision: { type: Number, default: 1, min: 1 },
    amendmentRevision: { type: Number, default: 0, min: 0 },
    originalSubmission: { type: mongoose.Schema.Types.Mixed, immutable: true },
    correctionStage: { type: String },
    submittedAt: Date,
    submittedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
schema.index({ societyId: 1, status: 1, startDate: 1 });
schema.index({ createdByUserId: 1, status: 1 }, { name: "event_creator_live_status" });
module.exports = mongoose.model("Event", schema);
