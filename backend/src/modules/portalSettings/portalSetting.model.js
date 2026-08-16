const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    isPublic: { type: Boolean, default: false, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);
module.exports = mongoose.model("PortalSetting", schema);
