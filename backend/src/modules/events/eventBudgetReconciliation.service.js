const AppError = require("../../common/errors/AppError");
const Event = require("./event.model");
const Audit = require("./eventAudit.model");
const SocietyBudgetTransaction = require("../societyBudgets/societyBudgetTransaction.model");
const budgets = require("../societyBudgets/societyBudget.service");
const { TRANSACTION_TYPES } = require("../societyBudgets/societyBudget.constants");
const { resolveSanctionedBudgetAmount } = require("./event.constants");

const findExistingTransaction = (eventId) =>
  SocietyBudgetTransaction.findOne({
    referenceType: "EVENT",
    referenceId: eventId,
    transactionType: TRANSACTION_TYPES.UTILIZE,
  }).lean();

// Read-only report: every APPROVED event with a positive sanctioned budget, and whether its
// final-approval utilization transaction actually exists. Never mutates anything.
const buildReport = async () => {
  const events = await Event.find({ status: "APPROVED" })
    .select("eventCode societyId academicSession budget")
    .lean();
  const rows = [];
  for (const event of events) {
    const sanctionedAmount = resolveSanctionedBudgetAmount(event.budget);
    if (!(sanctionedAmount > 0)) continue;
    const transaction = await findExistingTransaction(event._id);
    rows.push({
      eventId: String(event._id),
      eventCode: event.eventCode,
      societyId: String(event.societyId),
      academicSession: event.academicSession,
      sanctionedAmount,
      hasTransaction: Boolean(transaction),
      transactionId: transaction ? String(transaction._id) : null,
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    totalApprovedWithSanctionedBudget: rows.length,
    missingCount: rows.filter((row) => !row.hasTransaction).length,
    rows,
  };
};

// Repairs exactly one Event. Idempotent: if a utilization transaction already exists for this
// Event (posted by this function, by the live workflow, or by a previous repair run), no second
// transaction is created — the Event's metadata is simply reconciled to point at the existing one.
const repairEvent = async (eventId, { actorId }) => {
  if (!actorId) throw new AppError("An actor ID is required to repair an Event budget", 400, "VALIDATION_ERROR");
  const event = await Event.findOne({ _id: eventId, status: "APPROVED" });
  if (!event) throw new AppError("Approved event not found", 404, "EVENT_NOT_FOUND");
  const sanctionedAmount = resolveSanctionedBudgetAmount(event.budget);
  if (!(sanctionedAmount > 0)) return { repaired: false, reason: "NO_SANCTIONED_BUDGET" };

  const existing = await findExistingTransaction(event._id);
  if (existing) {
    if (String(event.budget.budgetTransactionId || "") !== String(existing._id)) {
      event.budget.deductionStatus = "POSTED";
      event.budget.deductedAmount = existing.amount;
      event.budget.deductedAt = existing.createdAt;
      event.budget.societyBudgetId = existing.budgetId;
      event.budget.budgetTransactionId = existing._id;
      await event.save();
    }
    return { repaired: false, reason: "ALREADY_POSTED", transaction: existing };
  }

  const posting = await budgets.utilizeEventBudget({
    societyId: event.societyId,
    academicSession: event.academicSession,
    eventId: event._id,
    amount: sanctionedAmount,
    reason: `Historical reconciliation - Event ${event.eventCode} final approval budget utilization`,
    createdBy: actorId,
  });
  event.budget.deductionStatus = "POSTED";
  event.budget.deductedAmount = posting.transaction.amount;
  event.budget.deductedAt = posting.transaction.createdAt || new Date();
  event.budget.societyBudgetId = posting.budget._id;
  event.budget.budgetTransactionId = posting.transaction._id;
  await event.save();
  await Audit.create({
    eventId: event._id,
    action: "EVENT_BUDGET_RECONCILED",
    actorUserId: actorId,
    metadata: { amount: sanctionedAmount, transactionId: String(posting.transaction._id) },
  });
  return { repaired: !posting.alreadyPosted, transaction: posting.transaction };
};

module.exports = { buildReport, repairEvent };
