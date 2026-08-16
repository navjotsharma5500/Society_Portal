const mongoose = require("mongoose"), Verification = require("./societyClaimVerification.model"), Claim = require("../societyClaims/societyClaim.model");
const create = (data) => Verification.create(data);
const findByClaim = (claimId) => Verification.find({ claimId }).select("-metadata").sort({ decisionAt: -1 }).lean();
const objectId = (value) => value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));
const buildFilter = (userId, filters = {}, global = false) => {
  const q = global ? {} : { verificationTargetUserIds: objectId(userId) };
  if (filters.status) q.status = filters.status; else if (!filters.includeAllStatuses) q.status = "PENDING";
  if (filters.societyId) q.societyId = objectId(filters.societyId);
  if (filters.roleId) q.claimedRoleId = objectId(filters.roleId);
  if (filters.academicSession) q["metadata.academicSession"] = filters.academicSession;
  if (filters.submittedFrom || filters.submittedTo) q.updatedAt = { ...(filters.submittedFrom ? { $gte: new Date(filters.submittedFrom) } : {}), ...(filters.submittedTo ? { $lte: new Date(`${filters.submittedTo}T23:59:59.999Z`) } : {}) };
  return q;
};
const assignedQueue = async (userId, page, limit, filters = {}, global = false) => {
  const filter = buildFilter(userId, filters, global);
  const [items, totalItems] = await Promise.all([
    Claim.find(filter).select("-metadata").populate("societyId", "name code").populate("claimedRoleId", "name code rank").populate("studentMasterId", "name rollNumber email course branch year").sort({ updatedAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Claim.countDocuments(filter),
  ]);
  return { items, totalItems };
};
const assignedCounts = async (userId, filters = {}, global = false) => {
  if (!filters || typeof filters !== "object" || filters instanceof mongoose.Types.ObjectId) filters = { societyId: filters };
  const match = buildFilter(userId, { ...filters, status: undefined, includeAllStatuses: true }, global);
  const rows = await Claim.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
};
module.exports = { create, findByClaim, assignedQueue, assignedCounts };
