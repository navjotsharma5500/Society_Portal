const mongoose = require("mongoose");
const { TRANSACTION_TYPES, DIRECTIONS, ACADEMIC_SESSION_PATTERN } = require("./societyBudget.constants");

const immutable = (definition) => ({ ...definition, immutable: true });
const transactionSchema = new mongoose.Schema({
  budgetId: immutable({ type: mongoose.Schema.Types.ObjectId, ref: "SocietyBudget", required: true, index: true }),
  societyId: immutable({ type: mongoose.Schema.Types.ObjectId, ref: "Society", required: true, index: true }),
  academicSession: immutable({ type: String, required: true, trim: true, match: ACADEMIC_SESSION_PATTERN, index: true }),
  transactionType: immutable({ type: String, required: true, enum: Object.values(TRANSACTION_TYPES), index: true }),
  amount: immutable({ type: Number, required: true, min: Number.MIN_VALUE }),
  direction: immutable({ type: String, required: true, enum: Object.values(DIRECTIONS) }),
  balanceBefore: immutable({ type: Number, required: true }), balanceAfter: immutable({ type: Number, required: true }),
  reservedBefore: immutable({ type: Number, default: 0 }), reservedAfter: immutable({ type: Number, default: 0 }),
  utilizedBefore: immutable({ type: Number, default: 0 }), utilizedAfter: immutable({ type: Number, default: 0 }),
  referenceType: immutable({ type: String, trim: true }), referenceId: immutable({ type: mongoose.Schema.Types.ObjectId }),
  reason: immutable({ type: String, required: true, trim: true, maxlength: 1000 }),
  metadata: immutable({ type: mongoose.Schema.Types.Mixed, default: () => ({}) }),
  createdBy: immutable({ type: mongoose.Schema.Types.ObjectId, ref: "User" }),
}, { timestamps: true });

transactionSchema.index({ budgetId: 1, createdAt: -1 });
transactionSchema.index({ societyId: 1, academicSession: 1, createdAt: -1 });

module.exports = mongoose.model("SocietyBudgetTransaction", transactionSchema);
