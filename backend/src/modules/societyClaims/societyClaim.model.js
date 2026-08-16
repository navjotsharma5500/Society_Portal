const mongoose = require("mongoose"),
  { CLAIM_STATUSES, ROUTE_TYPES } = require("./societyClaim.constants");
const { attachPublicId } = require("../publicIds/publicId.service");
const eventSchema = new mongoose.Schema(
  {
    eventName: { type: String, required: true, trim: true, maxlength: 200 },
    startDate: { type: Date, required: true },
    endDate: Date,
    description: { type: String, trim: true, maxlength: 2000 },
    optionalVenue: { type: String, trim: true, maxlength: 300 },
    optionalReference: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: true }
);
const schema = new mongoose.Schema(
  {
    onboardingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentOnboarding",
      required: true,
      index: true,
    },
    studentMasterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentMaster",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    societyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    claimedRoleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
      index: true,
    },
    claimedRoleCode: { type: String, required: true, trim: true },
    claimedRoleName: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: Date,
    isOngoing: { type: Boolean, default: false },
    events: { type: [eventSchema], default: [] },
    studentDescription: { type: String, trim: true, maxlength: 3000 },
    attemptNumber: { type: Number, default: 1, min: 1, max: 2, index: true },
    status: {
      type: String,
      enum: Object.values(CLAIM_STATUSES),
      default: "DRAFT",
      index: true,
    },
    verificationRouteType: { type: String, enum: Object.values(ROUTE_TYPES) },
    verificationTargetUserIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    ],
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decisionAt: Date,
    rejectionReason: { type: String, trim: true, maxlength: 3000 },
    verificationRemarks: { type: String, trim: true, maxlength: 3000 },
    activeRoleAssignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserRoleAssignment",
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, optimisticConcurrency: true }
);
schema.index({ onboardingId: 1, societyId: 1, claimedRoleId: 1, status: 1 });
schema.index(
  {
    onboardingId: 1,
    societyId: 1,
    claimedRoleId: 1,
    startDate: 1,
    endDate: 1,
    isOngoing: 1,
  },
  { unique: true }
);
schema.index({ verificationTargetUserIds: 1, status: 1, updatedAt: -1 });
schema.index({ studentMasterId: 1, status: 1 });
attachPublicId(schema, "SOCIETY_CLAIM");
module.exports = mongoose.model("SocietyClaim", schema);
