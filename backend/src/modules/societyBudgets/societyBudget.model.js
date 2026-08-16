const mongoose = require("mongoose");
const { attachPublicId } = require("../publicIds/publicId.service");
const { BUDGET_STATUSES, ACADEMIC_SESSION_PATTERN } = require("./societyBudget.constants");

const societyBudgetSchema = new mongoose.Schema({
  societyId: { type: mongoose.Schema.Types.ObjectId, ref: "Society", required: true, index: true },
  academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", index: true },
  academicSession: { type: String, required: true, trim: true, match: ACADEMIC_SESSION_PATTERN, index: true },
  currency: { type: String, default: "INR", trim: true, uppercase: true },
  allocatedAmount: { type: Number, required: true, min: 0 },
  reservedAmount: { type: Number, default: 0, min: 0 },
  utilizedAmount: { type: Number, default: 0, min: 0 },
  availableAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: Object.values(BUDGET_STATUSES), default: BUDGET_STATUSES.ACTIVE, index: true },
  remarks: { type: String, trim: true, maxlength: 1000 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

societyBudgetSchema.index({ societyId: 1, academicSession: 1 }, { unique: true, name: "unique_society_annual_budget" });
societyBudgetSchema.index({ societyId: 1, academicSessionId: 1 }, { unique: true, sparse: true, name: "unique_society_session_budget_id" });
societyBudgetSchema.pre("validate", function enforceBalance() {
  this.availableAmount = this.allocatedAmount - this.reservedAmount - this.utilizedAmount;
  if (this.availableAmount < 0) this.invalidate("availableAmount", "Available amount cannot be negative");
});
attachPublicId(societyBudgetSchema, "BUDGET", { yearFrom: (document) => /^\d{4}/.test(document.academicSession || "") ? Number(document.academicSession.slice(2, 4)) : undefined });

module.exports = mongoose.model("SocietyBudget", societyBudgetSchema);
