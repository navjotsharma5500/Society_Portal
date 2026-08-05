const mongoose = require("mongoose");
const { ROLE_CATEGORIES, ROLE_SCOPE_TYPES, ROLE_STATUSES } = require("./role.constants");
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 150 }, code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: /^[A-Z0-9][A-Z0-9_-]*$/, index: true },
  description: { type: String, trim: true, maxlength: 1000 }, category: { type: String, required: true, enum: Object.values(ROLE_CATEGORIES), index: true },
  scopeType: { type: String, enum: Object.values(ROLE_SCOPE_TYPES), default: ROLE_SCOPE_TYPES.GLOBAL, index: true }, rank: { type: Number, default: 0, index: true }, dashboardKey: { type: String, trim: true },
  isSystemRole: { type: Boolean, default: false }, isAssignable: { type: Boolean, default: true }, isLeadershipRole: { type: Boolean, default: false }, isStudentRole: { type: Boolean, default: false }, isFacultyStaffRole: { type: Boolean, default: false },
  allowsMultipleSocieties: { type: Boolean, default: true }, maxConcurrentSocieties: { type: Number, default: null, min: 1 }, status: { type: String, enum: Object.values(ROLE_STATUSES), default: ROLE_STATUSES.ACTIVE, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
module.exports = mongoose.model("Role", schema);
