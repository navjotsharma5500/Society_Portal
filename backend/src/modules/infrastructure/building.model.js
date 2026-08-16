const mongoose = require("mongoose");
const { attachPublicId } = require("../publicIds/publicId.service");
const schema = new mongoose.Schema({ name: { type: String, required: true, trim: true }, code: { type: String, required: true, unique: true, trim: true, uppercase: true }, campus: { type: String, trim: true }, description: { type: String, trim: true, maxlength: 1000 }, status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }, sortOrder: { type: Number, default: 0 }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" } }, { timestamps: true });
attachPublicId(schema, "BUILDING");
module.exports = mongoose.model("Building", schema);
