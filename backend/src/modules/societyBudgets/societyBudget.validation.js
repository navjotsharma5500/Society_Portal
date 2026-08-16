const AppError = require("../../common/errors/AppError");
const { BUDGET_STATUSES, TRANSACTION_TYPES, DIRECTIONS, ADJUSTMENT_TYPES, ACADEMIC_SESSION_PATTERN, PAGINATION } = require("./societyBudget.constants");

const fail = (message, code = "VALIDATION_ERROR") => { throw new AppError(message, 400, code); };
const text = (value, field, { required = false, max } = {}) => {
  if (value === undefined || value === null) { if (required) fail(`${field} is required`); return undefined; }
  if (typeof value !== "string") fail(`${field} must be a string`);
  const result = value.trim();
  if (required && !result) fail(`${field} is required`);
  if (max && result.length > max) fail(`${field} cannot exceed ${max} characters`);
  return result;
};
const amount = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) fail("amount must be greater than zero", "INVALID_BUDGET_AMOUNT");
  return value;
};
const allocation = (value) => { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail("allocatedAmount must be zero or greater", "INVALID_BUDGET_AMOUNT"); return value; };
const session = (value, required = false) => {
  const result = text(value, "academicSession", { required });
  if (result && !ACADEMIC_SESSION_PATTERN.test(result)) fail("academicSession must use YYYY-YY format", "INVALID_ACADEMIC_SESSION");
  return result;
};
const positiveInt = (value, fallback, field) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) fail(`${field} must be a positive integer`);
  return Number(value);
};
const paging = (query) => {
  const page = positiveInt(query.page, PAGINATION.DEFAULT_PAGE, "page");
  const limit = positiveInt(query.limit, PAGINATION.DEFAULT_LIMIT, "limit");
  if (limit > PAGINATION.MAX_LIMIT) fail(`limit cannot exceed ${PAGINATION.MAX_LIMIT}`);
  return { page, limit };
};
const validateCreate = (req, res, next) => { try {
  const allocatedAmount = allocation(req.body?.allocatedAmount);
  req.body = { societyId: text(req.body?.societyId, "societyId", { required: true }), academicSessionId: text(req.body?.academicSessionId, "academicSessionId"), academicSession: session(req.body?.academicSession, !req.body?.academicSessionId), allocatedAmount, remarks: text(req.body?.remarks, "remarks", { max: 1000 }), metadata: req.body?.metadata, createdBy: req.body?.createdBy };
  if (req.body.metadata !== undefined && (req.body.metadata === null || Array.isArray(req.body.metadata) || typeof req.body.metadata !== "object")) fail("metadata must be an object");
  next();
} catch (error) { next(error); } };
const validateAdjustment = (req, res, next) => { try {
  const adjustmentType = text(req.body?.adjustmentType, "adjustmentType", { required: true }).toUpperCase();
  if (!Object.values(ADJUSTMENT_TYPES).includes(adjustmentType)) fail("adjustmentType must be INCREASE or DECREASE", "INVALID_ADJUSTMENT_TYPE");
  req.body = { adjustmentType, amount: amount(req.body?.amount), reason: text(req.body?.reason, "reason", { required: true, max: 1000 }), createdBy: req.body?.createdBy }; next();
} catch (error) { next(error); } };
const validateSetAllocation = (req, res, next) => { try { req.body = { allocatedAmount: allocation(req.body?.allocatedAmount), reason: text(req.body?.reason, "reason", { required: true, max: 1000 }) }; next(); } catch (error) { next(error); } };
const validateManual = (req, res, next) => { try {
  const direction = text(req.body?.direction, "direction", { required: true }).toUpperCase();
  if (!Object.values(DIRECTIONS).includes(direction)) fail("direction must be CREDIT or DEBIT", "INVALID_TRANSACTION_DIRECTION");
  req.body = { direction, amount: amount(req.body?.amount), reason: text(req.body?.reason, "reason", { required: true, max: 1000 }), createdBy: req.body?.createdBy }; next();
} catch (error) { next(error); } };
const validateClose = (req, res, next) => { try { req.body = { reason: text(req.body?.reason, "reason", { required: true, max: 1000 }), createdBy: req.body?.createdBy }; next(); } catch (error) { next(error); } };
const validateList = (req, res, next) => { try {
  const status = text(req.query.status, "status"); if (status && !Object.values(BUDGET_STATUSES).includes(status)) fail("Invalid budget status");
  req.budgetFilters = { societyId: text(req.query.societyId, "societyId"), academicSession: session(req.query.academicSession), status, ...paging(req.query) }; next();
} catch (error) { next(error); } };
const validateCurrent = (req, res, next) => { try { req.academicSession = session(req.query.academicSession, true); next(); } catch (error) { next(error); } };
const validateSummary = (req, res, next) => { try { req.academicSession = session(req.query.academicSession); next(); } catch (error) { next(error); } };
const validateTransactions = (req, res, next) => { try {
  const transactionType = text(req.query.transactionType, "transactionType"); if (transactionType && !Object.values(TRANSACTION_TYPES).includes(transactionType)) fail("Invalid transaction type");
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : undefined; const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : undefined;
  if (dateFrom && Number.isNaN(dateFrom.getTime())) fail("dateFrom must be a valid date"); if (dateTo && Number.isNaN(dateTo.getTime())) fail("dateTo must be a valid date"); if (dateFrom && dateTo && dateFrom > dateTo) fail("dateFrom cannot be after dateTo");
  req.transactionFilters = { transactionType, dateFrom, dateTo, ...paging(req.query) }; next();
} catch (error) { next(error); } };

module.exports = { validateCreate, validateAdjustment, validateSetAllocation, validateManual, validateClose, validateList, validateCurrent, validateSummary, validateTransactions };
