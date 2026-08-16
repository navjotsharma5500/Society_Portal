const mongoose = require("mongoose"),
  { VERIFICATION_DECISIONS } = require("./societyClaimVerification.constants");
const schema = new mongoose.Schema(
  {
    claimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocietyClaim",
      required: true,
      index: true,
    },
    attemptNumber: { type: Number, required: true, min: 1, max: 2 },
    verifierUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    verifierRoleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    verifierRoleCode: { type: String, trim: true },
    decision: {
      type: String,
      enum: Object.values(VERIFICATION_DECISIONS),
      required: true,
    },
    reason: { type: String, trim: true, maxlength: 3000 },
    remarks: { type: String, trim: true, maxlength: 3000 },
    decisionAt: { type: Date, default: Date.now, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);
schema.index(
  { claimId: 1, attemptNumber: 1, verifierUserId: 1 },
  { unique: true }
);
schema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
  ],
  function () {
    throw new Error("Verification records are immutable");
  }
);
module.exports = mongoose.model("SocietyClaimVerification", schema);
