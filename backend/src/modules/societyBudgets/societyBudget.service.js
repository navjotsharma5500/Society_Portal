const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Society = require("../societies/society.model");
const academicSessions = require("../academicSessions/academicSession.service");
const repository = require("./societyBudget.repository");
const { BUDGET_STATUSES, TRANSACTION_TYPES, DIRECTIONS, ADJUSTMENT_TYPES } = require("./societyBudget.constants");

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(String(id));
const assertBudgetId = (id) => { if (!isObjectId(id)) throw new AppError("Invalid budget ID", 400, "INVALID_BUDGET_ID"); };
const assertSocietyId = (id) => { if (!isObjectId(id)) throw new AppError("Invalid society ID", 400, "INVALID_SOCIETY_ID"); };
const notFound = () => new AppError("Budget not found", 404, "BUDGET_NOT_FOUND");
const insufficient = () => new AppError("Insufficient available budget", 409, "INSUFFICIENT_AVAILABLE_BUDGET");
const requireCurrentSession = async () => {
  const session = await academicSessions.getCurrentAcademicSession();
  if (!session) throw new AppError("Please create and activate an Academic Session first.", 409, "CURRENT_ACADEMIC_SESSION_REQUIRED");
  return session;
};
const assertOperation = ({ amount, reason, referenceId }) => {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new AppError("Budget amount must be greater than zero", 400, "INVALID_BUDGET_AMOUNT");
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000) throw new AppError("A reason of at most 1000 characters is required", 400, "VALIDATION_ERROR");
  if (referenceId !== undefined && !isObjectId(referenceId)) throw new AppError("Invalid reference ID", 400, "VALIDATION_ERROR");
};

const supportsTransactions = () => {
  const type = mongoose.connection.client?.topology?.description?.type || "";
  return type.startsWith("ReplicaSet") || type === "Sharded";
};

const runAtomic = async (operation) => {
  if (!supportsTransactions()) return operation(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await operation(session); });
    return result;
  } finally { await session.endSession(); }
};

const transactionData = (before, after, details) => ({
  budgetId: before._id, societyId: before.societyId, academicSession: before.academicSession,
  transactionType: details.transactionType, amount: details.amount, direction: details.direction,
  balanceBefore: before.availableAmount, balanceAfter: after.availableAmount,
  reservedBefore: before.reservedAmount, reservedAfter: after.reservedAmount,
  utilizedBefore: before.utilizedAmount, utilizedAfter: after.utilizedAmount,
  referenceType: details.referenceType, referenceId: details.referenceId, reason: details.reason,
  metadata: details.metadata || {}, createdBy: details.createdBy,
});

const createAnnualBudget = async (data) => {
  await requireCurrentSession();
  assertSocietyId(data.societyId);
  const society = await Society.findById(data.societyId);
  if (!society) throw new AppError("Society not found", 404, "SOCIETY_NOT_FOUND");
  if (!society.isActive || society.status !== "ACTIVE") throw new AppError("An active budget cannot be created for an inactive society", 409, "SOCIETY_INACTIVE");
  const academicSession = await academicSessions.resolveSession(data.academicSessionId || data.academicSession, { required: true });
  if (!academicSession) throw new AppError("Academic session not found", 404, "ACADEMIC_SESSION_NOT_FOUND");
  data = { ...data, academicSessionId: academicSession._id, academicSession: academicSession.name };
  if (await repository.findBySocietySession(data.societyId, data.academicSession)) throw new AppError("Budget already exists for this society and academic session", 409, "BUDGET_ALREADY_EXISTS");

  try {
    return await runAtomic(async (session) => {
      const budget = await repository.createBudget({ ...data, reservedAmount: 0, utilizedAmount: 0, availableAmount: data.allocatedAmount }, session);
      if (data.allocatedAmount > 0) await repository.createTransaction({
        budgetId: budget._id, societyId: budget.societyId, academicSession: budget.academicSession,
        transactionType: TRANSACTION_TYPES.INITIAL_ALLOCATION, amount: data.allocatedAmount,
        direction: DIRECTIONS.CREDIT, balanceBefore: 0, balanceAfter: budget.availableAmount,
        reservedBefore: 0, reservedAfter: 0, utilizedBefore: 0, utilizedAfter: 0,
        reason: data.remarks || "Initial annual allocation", metadata: {}, createdBy: data.createdBy,
      }, session);
      return budget;
    });
  } catch (error) {
    if (error?.code === 11000) throw new AppError("Budget already exists for this society and academic session", 409, "BUDGET_ALREADY_EXISTS");
    throw error;
  }
};

const getOpenBudget = async (budgetId, session) => {
  assertBudgetId(budgetId);
  const budget = await repository.findById(budgetId, session);
  if (!budget) throw notFound();
  if (budget.status === BUDGET_STATUSES.CLOSED) throw new AppError("Budget is closed", 409, "BUDGET_CLOSED");
  return budget;
};

const mutateBudget = (budgetId, details, calculate) => runAtomic(async (session) => {
  const before = await getOpenBudget(budgetId, session);
  const auditDetails = typeof details === "function" ? details(before) : details;
  const next = calculate(before);
  const availableAmount = next.allocatedAmount - next.reservedAmount - next.utilizedAmount;
  if ([next.allocatedAmount, next.reservedAmount, next.utilizedAmount, availableAmount].some((value) => value < 0)) throw insufficient();
  const filter = { _id: before._id, status: { $ne: BUDGET_STATUSES.CLOSED }, allocatedAmount: before.allocatedAmount, reservedAmount: before.reservedAmount, utilizedAmount: before.utilizedAmount };
  const after = await repository.updateMatching(filter, { $set: { ...next, availableAmount } }, session);
  if (!after) throw new AppError("Budget changed concurrently; retry the operation", 409, "BUDGET_CONFLICT");
  try {
    await repository.createTransaction(transactionData(before, after, auditDetails), session);
  } catch (error) {
    if (!session) await repository.updateMatching({ _id: after._id, allocatedAmount: after.allocatedAmount, reservedAmount: after.reservedAmount, utilizedAmount: after.utilizedAmount }, { $set: { allocatedAmount: before.allocatedAmount, reservedAmount: before.reservedAmount, utilizedAmount: before.utilizedAmount, availableAmount: before.availableAmount, status: before.status } });
    throw error;
  }
  return after;
});

const adjustBudget = async (budgetId, data) => {
  const increase = data.adjustmentType === ADJUSTMENT_TYPES.INCREASE;
  return mutateBudget(budgetId, {
    transactionType: increase ? TRANSACTION_TYPES.ALLOCATION_INCREASE : TRANSACTION_TYPES.ALLOCATION_DECREASE,
    amount: data.amount, direction: increase ? DIRECTIONS.CREDIT : DIRECTIONS.DEBIT, reason: data.reason, createdBy: data.createdBy,
  }, (budget) => ({ allocatedAmount: budget.allocatedAmount + (increase ? data.amount : -data.amount), reservedAmount: budget.reservedAmount, utilizedAmount: budget.utilizedAmount }));
};

const manualAdjustment = async (budgetId, data) => {
  const credit = data.direction === DIRECTIONS.CREDIT;
  return mutateBudget(budgetId, { transactionType: TRANSACTION_TYPES.MANUAL_ADJUSTMENT, amount: data.amount, direction: data.direction, reason: data.reason, createdBy: data.createdBy },
    (budget) => ({ allocatedAmount: budget.allocatedAmount + (credit ? data.amount : -data.amount), reservedAmount: budget.reservedAmount, utilizedAmount: budget.utilizedAmount }));
};
const setAllocation = async (budgetId, data) => { const budget = await getBudget(budgetId), difference = data.allocatedAmount - budget.allocatedAmount; if (!difference) return budget; return adjustBudget(budgetId, { adjustmentType: difference > 0 ? ADJUSTMENT_TYPES.INCREASE : ADJUSTMENT_TYPES.DECREASE, amount: Math.abs(difference), reason: data.reason, createdBy: data.createdBy }); };

const closeBudget = async (budgetId, data) => mutateBudget(budgetId, (budget) => ({
  transactionType: TRANSACTION_TYPES.CLOSE, amount: Math.max(budget.availableAmount, budget.allocatedAmount, Number.MIN_VALUE), direction: DIRECTIONS.DEBIT, reason: data.reason, createdBy: data.createdBy,
}), (budget) => ({ allocatedAmount: budget.allocatedAmount, reservedAmount: budget.reservedAmount, utilizedAmount: budget.utilizedAmount, status: BUDGET_STATUSES.CLOSED }));

const reserveBudget = ({ budgetId, amount, referenceType, referenceId, reason, createdBy }) => { assertOperation({ amount, reason, referenceId }); return mutateBudget(budgetId,
  { transactionType: TRANSACTION_TYPES.RESERVE, amount, direction: DIRECTIONS.DEBIT, referenceType, referenceId, reason, createdBy },
  (budget) => ({ allocatedAmount: budget.allocatedAmount, reservedAmount: budget.reservedAmount + amount, utilizedAmount: budget.utilizedAmount })); };
const releaseReservedBudget = ({ budgetId, amount, referenceType, referenceId, reason, createdBy }) => { assertOperation({ amount, reason, referenceId }); return mutateBudget(budgetId,
  { transactionType: TRANSACTION_TYPES.RELEASE_RESERVE, amount, direction: DIRECTIONS.CREDIT, referenceType, referenceId, reason, createdBy },
  (budget) => ({ allocatedAmount: budget.allocatedAmount, reservedAmount: budget.reservedAmount - amount, utilizedAmount: budget.utilizedAmount })); };
const utilizeReservedBudget = ({ budgetId, amount, referenceType, referenceId, reason, createdBy }) => { assertOperation({ amount, reason, referenceId }); return mutateBudget(budgetId,
  { transactionType: TRANSACTION_TYPES.UTILIZE, amount, direction: DIRECTIONS.DEBIT, referenceType, referenceId, reason, createdBy },
  (budget) => ({ allocatedAmount: budget.allocatedAmount, reservedAmount: budget.reservedAmount - amount, utilizedAmount: budget.utilizedAmount + amount })); };

const listBudgets = async (filters) => {
  const query = {};
  if (filters.societyId) { assertSocietyId(filters.societyId); query.societyId = filters.societyId; }
  if (filters.academicSession) query.academicSession = filters.academicSession;
  if (filters.status) query.status = filters.status;
  const { items, totalItems } = await repository.findAll(query, filters.page, filters.limit);
  return { items, pagination: { page: filters.page, limit: filters.limit, totalItems, totalPages: Math.ceil(totalItems / filters.limit) } };
};
const getBudget = async (budgetId) => { assertBudgetId(budgetId); const budget = await repository.findById(budgetId); if (!budget) throw notFound(); return budget; };
const getCurrentBudget = async (societyId, academicSession) => { assertSocietyId(societyId); const budget = await repository.findBySocietySession(societyId, academicSession); if (!budget) throw notFound(); return budget; };
const listTransactions = async (budgetId, filters) => { await getBudget(budgetId); const query = { budgetId }; if (filters.transactionType) query.transactionType = filters.transactionType; if (filters.dateFrom || filters.dateTo) { query.createdAt = {}; if (filters.dateFrom) query.createdAt.$gte = filters.dateFrom; if (filters.dateTo) query.createdAt.$lte = filters.dateTo; } const { items, totalItems } = await repository.findTransactions(query, filters.page, filters.limit); return { items, pagination: { page: filters.page, limit: filters.limit, totalItems, totalPages: Math.ceil(totalItems / filters.limit) } }; };
const getSummary = async (academicSession) => ({ academicSession: academicSession || null, totalAllocated: 0, totalReserved: 0, totalUtilized: 0, totalAvailable: 0, activeBudgets: 0, closedBudgets: 0, ...(await repository.summarize(academicSession) || {}), _id: undefined });

module.exports = { requireCurrentSession, createAnnualBudget, adjustBudget, setAllocation, manualAdjustment, closeBudget, listBudgets, getBudget, getCurrentBudget, listTransactions, getSummary, reserveBudget, releaseReservedBudget, utilizeReservedBudget };
