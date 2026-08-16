const mongoose = require("mongoose");
const { attachPublicId } = require("../publicIds/publicId.service");
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  type: { type: String, trim: true }, campus: { type: String, trim: true }, status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
  sortOrder: { type: Number, default: 0 }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
schema.index({ name: 1 });
attachPublicId(schema, "DEPARTMENT");
module.exports = mongoose.model("Department", schema);
