const mongoose = require("mongoose");
const { SESSION_STATUSES } = require("./auth.constants");
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    refreshTokenHash: { type: String, required: true, unique: true },
    tokenFamily: { type: String, required: true, index: true },
    deviceId: { type: String, trim: true },
    deviceName: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    expiresAt: { type: Date, required: true },
    lastUsedAt: Date,
    revokedAt: Date,
    revocationReason: { type: String, trim: true },
    replacedBySessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthSession",
    },
    status: {
      type: String,
      enum: Object.values(SESSION_STATUSES),
      default: SESSION_STATUSES.ACTIVE,
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ userId: 1, status: 1 });
module.exports = mongoose.model("AuthSession", schema);
