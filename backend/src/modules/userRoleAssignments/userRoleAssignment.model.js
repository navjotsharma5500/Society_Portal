const mongoose = require("mongoose");
const { attachPublicId } = require("../publicIds/publicId.service");
const { ASSIGNMENT_SCOPE_TYPES, ASSIGNMENT_STATUSES, ASSIGNMENT_SOURCES } = require("./userRoleAssignment.constants");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, roleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role", required: true, index: true }, scopeType: { type: String, enum: Object.values(ASSIGNMENT_SCOPE_TYPES), required: true, index: true }, societyId: { type: mongoose.Schema.Types.ObjectId, ref: "Society", default: null, index: true }, academicSession: { type: String, trim: true, default: null }, validFrom: Date, validUntil: Date, isOngoing: { type: Boolean, default: true, index: true }, status: { type: String, enum: Object.values(ASSIGNMENT_STATUSES), default: ASSIGNMENT_STATUSES.ACTIVE, index: true }, assignmentSource: { type: String, enum: Object.values(ASSIGNMENT_SOURCES), default: ASSIGNMENT_SOURCES.SUPER_ADMIN }, isPrimary: { type: Boolean, default: false }, remarks: { type: String, trim: true, maxlength: 1000 }, metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
schema.index({ userId: 1, roleId: 1, scopeType: 1, societyId: 1, academicSession: 1 }, { unique: true, partialFilterExpression: { status: "ACTIVE", isOngoing: true } });
schema.pre("validate", function validateScope() { if (this.scopeType === "SOCIETY" && !this.societyId) this.invalidate("societyId", "societyId is required for SOCIETY scope"); if (this.scopeType === "GLOBAL" && this.societyId) this.invalidate("societyId", "societyId must be null for GLOBAL scope"); });
attachPublicId(schema, "ROLE_ASSIGNMENT");
module.exports = mongoose.model("UserRoleAssignment", schema);
