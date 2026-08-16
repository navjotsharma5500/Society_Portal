const mongoose = require("mongoose");
const {
  PERMISSION_TYPES,
  PERMISSION_STATUSES,
  PERMISSION_MODULES,
} = require("./permission.constants");
const schema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9][a-z0-9._-]*$/,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 1000 },
    module: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      enum: PERMISSION_MODULES,
      index: true,
    },
    resource: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    permissionType: {
      type: String,
      required: true,
      enum: Object.values(PERMISSION_TYPES),
      index: true,
    },
    uiKey: { type: String, trim: true },
    route: { type: String, trim: true },
    httpMethod: { type: String, uppercase: true, trim: true },
    apiPattern: { type: String, trim: true },
    category: { type: String, trim: true, index: true },
    sortOrder: { type: Number, default: 0 },
    isSystemPermission: { type: Boolean, default: false },
    status: {
      type: String,
      enum: Object.values(PERMISSION_STATUSES),
      default: PERMISSION_STATUSES.ACTIVE,
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
schema.index({ uiKey: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model("Permission", schema);
