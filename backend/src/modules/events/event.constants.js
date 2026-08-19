// ACTIVE_WORKFLOW_STAGES drives the live approval routing engine (see eventWorkflow.service.js
// `routing`) and is the only set new Events / new resubmission attempts ever move through.
// ASSISTANT_REVIEW is retained only as a LEGACY stage: old EventReview/Event documents created
// before Assistant was removed from Event approval may still carry it, and it must remain a valid
// enum value so that historical data stays readable — but it is never assignable to a new review
// and is excluded from routing, queues, and live-request accounting.
const ACTIVE_WORKFLOW_STAGES = Object.freeze({
  FACULTY_REVIEW: "FACULTY_REVIEW",
  DOSA_STAFF_REVIEW: "DOSA_STAFF_REVIEW",
  ADOSA_REVIEW: "ADOSA_REVIEW",
  DOSA_REVIEW: "DOSA_REVIEW",
});
const LEGACY_WORKFLOW_STAGES = Object.freeze({
  ASSISTANT_REVIEW: "ASSISTANT_REVIEW",
});
const WORKFLOW_STAGES = Object.freeze({
  ...ACTIVE_WORKFLOW_STAGES,
  ...LEGACY_WORKFLOW_STAGES,
});
const LIVE_EVENT_REQUEST_STATUSES = Object.freeze(Object.values(ACTIVE_WORKFLOW_STAGES));
const resolveSanctionedBudgetAmount = (budget = {}) => {
  const recommended = Number(budget?.totalRecommended);
  if (Number.isFinite(recommended) && recommended > 0) return recommended;
  const estimated = Number(budget?.totalEstimated);
  return Number.isFinite(estimated) && estimated > 0 ? estimated : 0;
};

// Recomputes item.estimatedAmount = quantity * estimatedUnitCost for every item (mutates in place,
// matching Mongoose subdocument semantics) and returns the authoritative totalEstimated. The backend
// must never trust a frontend-supplied estimatedAmount/totalEstimated — this is the single source of truth.
const recalculateBudgetItems = (items = []) => {
  items.forEach((item, index) => {
    item.estimatedAmount = Number(item.quantity || 0) * Number(item.estimatedUnitCost || 0);
    item.order = index;
  });
  return items.reduce((sum, item) => sum + Number(item.estimatedAmount || 0), 0);
};

// Fields a reviewer amendment (or a student budget-rectification edit) is allowed to touch.
const amendableFields = Object.freeze([
  "title",
  "startDate",
  "endDate",
  "dailySchedule",
  "venueRequirement",
  "objective",
  "annexure",
  "previousEvents",
  "budget",
]);

// Date-like values (Date instances, or ISO date/datetime strings) are canonicalized to a bare
// YYYY-MM-DD calendar date before comparison, so "2026-09-10T00:00:00.000Z" and "2026-09-10" — the
// same calendar date serialized two different ways — are never reported as a change. Every date field
// in this domain (startDate, endDate, dailySchedule[].date, previousEvents[].start/endDate) represents
// a calendar date only; time-of-day is carried separately as plain "HH:MM" strings.
const isDateLike = (value) =>
  value instanceof Date || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value));
const canonicalizeForDiff = (value) => {
  if (value == null) return value;
  if (isDateLike(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
  }
  if (Array.isArray(value)) return value.map(canonicalizeForDiff);
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalizeForDiff(value[key]);
    return out;
  }
  return value;
};
const plainForDiff = (value) => canonicalizeForDiff(JSON.parse(JSON.stringify(value ?? null)));

// Compares `proposal[field]` against `before[field]` for each field present on `proposal`, after
// normalizing away serialization-only differences. Only genuine semantic changes are returned.
const diffFields = (before, proposal = {}, fields = amendableFields) =>
  fields
    .filter(
      (field) =>
        Object.prototype.hasOwnProperty.call(proposal, field) &&
        JSON.stringify(plainForDiff(before[field])) !== JSON.stringify(plainForDiff(proposal[field]))
    )
    .map((field) => ({
      fieldPath: field,
      oldValue: plainForDiff(before[field]),
      newValue: plainForDiff(proposal[field]),
    }));

const currency = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const fieldLabel = (fieldPath) =>
  fieldPath
    .split(".")
    .pop()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
const describeBudgetChange = (oldValue, newValue) => {
  const lines = [],
    oldItems = oldValue?.items || [],
    newItems = newValue?.items || [];
  for (let index = 0; index < Math.max(oldItems.length, newItems.length); index += 1) {
    const before = oldItems[index],
      after = newItems[index];
    if (!before || !after) continue;
    const label = after.head || before.head || `Item ${index + 1}`;
    if (Number(before.estimatedUnitCost || 0) !== Number(after.estimatedUnitCost || 0))
      lines.push(`${label} — Unit Cost: ${currency(before.estimatedUnitCost)} → ${currency(after.estimatedUnitCost)}`);
    if (Number(before.quantity || 0) !== Number(after.quantity || 0))
      lines.push(`${label} — Quantity: ${before.quantity ?? 0} → ${after.quantity ?? 0}`);
  }
  if (Number(oldValue?.totalEstimated || 0) !== Number(newValue?.totalEstimated || 0))
    lines.push(`Total Estimated Budget: ${currency(oldValue?.totalEstimated)} → ${currency(newValue?.totalEstimated)}`);
  return lines.length ? lines : ["Budget details were revised."];
};
// Turns a raw {fieldPath, oldValue, newValue} amendment change into human-readable line(s),
// avoiding a raw JSON dump for the common, well-understood case (budget) and falling back to a
// simple labeled statement for anything else rather than printing nested object literals.
const describeChange = (change) =>
  change.fieldPath === "budget" ? describeBudgetChange(change.oldValue, change.newValue) : [`${fieldLabel(change.fieldPath)} was updated.`];
const describeChanges = (changes = []) => changes.flatMap(describeChange);

module.exports = {
  resolveSanctionedBudgetAmount,
  recalculateBudgetItems,
  amendableFields,
  diffFields,
  plainForDiff,
  describeChanges,
  STATUSES: Object.freeze({
    DRAFT: "DRAFT",
    ...WORKFLOW_STAGES,
    CHANGES_REQUESTED: "CHANGES_REQUESTED",
    BUDGET_RECTIFICATION_REQUIRED: "BUDGET_RECTIFICATION_REQUIRED",
    REJECTED: "REJECTED",
    CANCELLED: "CANCELLED",
    APPROVED: "APPROVED",
  }),
  WORKFLOW_STAGES,
  ACTIVE_WORKFLOW_STAGES,
  LEGACY_WORKFLOW_STAGES,
  LIVE_EVENT_REQUEST_STATUSES,
  isLiveEventRequestStatus: (status) => LIVE_EVENT_REQUEST_STATUSES.includes(status),
  MODES: Object.freeze({
    ONLINE: "ONLINE",
    OFFLINE: "OFFLINE",
    HYBRID: "HYBRID",
  }),
  SPEAKER_STATUSES: Object.freeze({ PENDING: "PENDING", APPROVED: "APPROVED" }),
  PREVIOUS_SOURCES: Object.freeze({ SYSTEM: "SYSTEM", MANUAL: "MANUAL" }),
};
