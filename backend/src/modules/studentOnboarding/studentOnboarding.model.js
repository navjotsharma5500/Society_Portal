const mongoose = require("mongoose"),
  { ONBOARDING_STATUSES,ONBOARDING_MODES } = require("./studentOnboarding.constants");
const emptySummary = () => ({
  totalClaims: 0,
  approvedClaims: 0,
  rejectedClaims: 0,
  pendingClaims: 0,
  lockedClaims: 0,
  approvedOngoingClaims: 0,
  approvedEndedClaims: 0,
});
const schema = new mongoose.Schema(
  {
    studentMasterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentMaster",
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ONBOARDING_STATUSES),
      default: "NOT_STARTED",
      index: true,
    },
    mode:{type:String,enum:Object.values(ONBOARDING_MODES)},
    currentAttempt: { type: Number, default: 1, min: 1, max: 2 },
    maxAttempts: { type: Number, default: 2, min: 2, max: 2 },
    submittedAt: Date,
    verificationStartedAt: Date,
    completedAt: Date,
    acceptedCurrentResultAt: Date,
    hasAcceptedPartialResult: { type: Boolean, default: false },
    summary: { type: mongoose.Schema.Types.Mixed, default: emptySummary },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, optimisticConcurrency: true }
);
module.exports = mongoose.model("StudentOnboarding", schema);
