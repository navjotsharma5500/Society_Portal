const mongoose = require("mongoose");
const { SOCIETY_STATUSES } = require("./society.constants");
const { CODE_PATTERN } = require("./societyCode.service");

const societySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 6,
      maxlength: 10,
      match: CODE_PATTERN,
    },
    shortName: { type: String, trim: true, maxlength: 50 },
    description: { type: String, trim: true, maxlength: 2000 },
    category: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    contactNumber: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    academicSession: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    status: {
      type: String,
      enum: Object.values(SOCIETY_STATUSES),
      default: SOCIETY_STATUSES.ACTIVE,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

societySchema.index({ name: 1 });
societySchema.index({ isActive: 1 });
societySchema.index({ status: 1 });
societySchema.index({ createdAt: -1 }, { name: "society_recent" });
societySchema.index({ isActive: 1, createdAt: -1 }, { name: "society_active_recent" });

module.exports = mongoose.model("Society", societySchema);
