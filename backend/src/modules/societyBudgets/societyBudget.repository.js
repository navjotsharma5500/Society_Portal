const SocietyBudget = require("./societyBudget.model");
const SocietyBudgetTransaction = require("./societyBudgetTransaction.model");

const createBudget = async (data, session) => (await SocietyBudget.create([data], session ? { session } : {}))[0];
const createTransaction = async (data, session) => (await SocietyBudgetTransaction.create([data], session ? { session } : {}))[0];
const findById = (id, session) => {
  const query = SocietyBudget.findById(id);
  return session ? query.session(session) : query;
};
const findBySocietySession = (societyId, academicSession) => SocietyBudget.findOne({ societyId, academicSession });
const findAll = async (filter, page, limit) => {
  const skip = (page - 1) * limit;
  const [items, totalItems] = await Promise.all([
    SocietyBudget.find(filter).populate("societyId", "name code status isActive").sort({ academicSession: -1, createdAt: -1 }).skip(skip).limit(limit),
    SocietyBudget.countDocuments(filter),
  ]);
  return { items, totalItems };
};
const updateMatching = (filter, update, session) => SocietyBudget.findOneAndUpdate(filter, update, { returnDocument: "after", runValidators: true, ...(session ? { session } : {}) });
const findTransactions = async (filter, page, limit) => {
  const skip = (page - 1) * limit;
  const [items, totalItems] = await Promise.all([
    SocietyBudgetTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SocietyBudgetTransaction.countDocuments(filter),
  ]);
  return { items, totalItems };
};
const summarize = async (academicSession) => {
  const match = academicSession ? { academicSession } : {};
  const [summary] = await SocietyBudget.aggregate([{ $match: match }, { $group: {
    _id: null, totalAllocated: { $sum: "$allocatedAmount" }, totalReserved: { $sum: "$reservedAmount" },
    totalUtilized: { $sum: "$utilizedAmount" }, totalAvailable: { $sum: "$availableAmount" },
    activeBudgets: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } },
    closedBudgets: { $sum: { $cond: [{ $eq: ["$status", "CLOSED"] }, 1, 0] } },
  } }]);
  return summary;
};

module.exports = { createBudget, createTransaction, findById, findBySocietySession, findAll, updateMatching, findTransactions, summarize };
