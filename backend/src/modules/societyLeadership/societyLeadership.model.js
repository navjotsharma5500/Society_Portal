const mongoose = require("mongoose");
const {
  LEADERSHIP_ROLES,
  LEADERSHIP_STATUSES,
  ACADEMIC_SESSION_PATTERN,
} = require("./societyLeadership.constants");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const societyLeadershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    societyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      match: /^[A-Z0-9][A-Z0-9_-]*$/,
      uppercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: EMAIL_PATTERN,
      index: true,
    },
    contactNumber: { type: String, trim: true, maxlength: 20 },
    designation: { type: String, trim: true, maxlength: 200 },
    department: { type: String, trim: true, maxlength: 200 },
    academicSession: {
      type: String,
      required: true,
      trim: true,
      match: ACADEMIC_SESSION_PATTERN,
    },
    startDate: Date,
    endDate: { type: Date, default: null },
    isOngoing: { type: Boolean, default: true },
    status: {
      type: String,
      enum: Object.values(LEADERSHIP_STATUSES),
      default: LEADERSHIP_STATUSES.ACTIVE,
    },
    notificationEnabled: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

societyLeadershipSchema.index({ societyId: 1, role: 1, academicSession: 1 });
societyLeadershipSchema.index({ createdAt: -1 }, { name: "leadership_recent" });
societyLeadershipSchema.index({ status: 1, isOngoing: 1, createdAt: -1 }, { name: "leadership_status_recent" });
societyLeadershipSchema.index(
  { societyId: 1, role: 1, email: 1, academicSession: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE", isOngoing: true },
    name: "unique_active_leadership_assignment",
  }
);

module.exports = mongoose.model("SocietyLeadership", societyLeadershipSchema);
