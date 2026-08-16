const mongoose = require("mongoose");
const { WORKFLOW_STAGES } = require("./event.constants");
const schema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    stage: {
      type: String,
      enum: Object.values(WORKFLOW_STAGES),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    assignedReviewerUserIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ],
    assignedRoleCode: { type: String, required: true },
    assignedAt: { type: Date, default: Date.now },
    decidedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decision: { type: String, enum: ["APPROVE", "REQUEST_CHANGES", "REJECT"] },
    remarks: { type: String, trim: true, maxlength: 3000 },
    decidedAt: Date,
    attempt: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);
schema.index({ eventId: 1, attempt: 1, stage: 1 }, { unique: true });
schema.index({ assignedReviewerUserIds: 1, status: 1, updatedAt: -1 });
module.exports = mongoose.model("EventReview", schema);
