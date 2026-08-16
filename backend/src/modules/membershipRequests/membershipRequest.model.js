const mongoose = require("mongoose"),
  { STATUSES, ROUTES } = require("./membershipRequest.constants");
const { attachPublicId } = require("../publicIds/publicId.service");
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentMasterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentMaster",
      required: true,
    },
    societyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    requestedRoleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    requestedRoleCode: String,
    requestedRoleName: String,
    approvedRoleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    approvedRoleCode: String,
    approvedRoleName: String,
    status: {
      type: String,
      enum: Object.values(STATUSES),
      default: STATUSES.SUBMITTED,
    },
    requestReason: { type: String, maxlength: 2000 },
    studentMessage: { type: String, maxlength: 2000 },
    verificationTargetUserIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    ],
    verificationRouteType: { type: String, enum: Object.values(ROUTES) },
    decisionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decisionAt: Date,
    decisionReason: String,
    decisionRemarks: String,
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocietyMembership",
    },
    attemptNumber: { type: Number, default: 1 },
    expiresAt: Date,
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, optimisticConcurrency: true }
);
schema.index({ userId: 1, status: 1 });
schema.index({ societyId: 1, status: 1 });
schema.index({ verificationTargetUserIds: 1, status: 1, updatedAt: -1 });
schema.index({ createdAt: 1 });
schema.index(
  { userId: 1, societyId: 1 },
  {
    unique: true,
    name: "membership_request_live_unique_v2",
    partialFilterExpression: {
      status: { $in: ["SUBMITTED", "PENDING", "CLARIFICATION_REQUESTED"] },
    },
  }
);
attachPublicId(schema, "JOIN_REQUEST");
module.exports = mongoose.model("MembershipRequest", schema);
