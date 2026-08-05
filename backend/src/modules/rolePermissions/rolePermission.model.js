const mongoose = require("mongoose");
const { EFFECTS, DATA_SCOPES } = require("./rolePermission.constants");
const schema = new mongoose.Schema({ roleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role", required: true, index: true }, permissionId: { type: mongoose.Schema.Types.ObjectId, ref: "Permission", required: true, index: true }, effect: { type: String, enum: Object.values(EFFECTS), default: EFFECTS.ALLOW }, conditions: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }, dataScope: { type: String, enum: Object.values(DATA_SCOPES), default: DATA_SCOPES.NONE }, isActive: { type: Boolean, default: true, index: true }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" } }, { timestamps: true });
schema.index({ roleId: 1, permissionId: 1 }, { unique: true });
module.exports = mongoose.model("RolePermission", schema);
