const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const {
  LEADERSHIP_ROLES,
  LEADERSHIP_STATUSES,
  PAGINATION,
  ACADEMIC_SESSION_PATTERN,
} = require("./societyLeadership.constants");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BODY_FIELDS = [
  "userId", "societyId", "role", "name", "email", "contactNumber", "designation", "department",
  "academicSession", "startDate", "endDate", "isOngoing", "status", "notificationEnabled",
  "metadata", "createdBy", "updatedBy",
];
const TEXT_FIELDS = ["role", "name", "email", "contactNumber", "designation", "department", "academicSession"];

const error = (message, code = "VALIDATION_ERROR") => new AppError(message, 400, code);

const parseDate = (value, field) => {
  if (value === null && field === "endDate") return null;
  if (typeof value !== "string" && !(value instanceof Date)) throw error(`${field} must be a valid date`, "INVALID_DATE_RANGE");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw error(`${field} must be a valid date`, "INVALID_DATE_RANGE");
  return date;
};

const normalize = (body) => {
  const data = {};
  for (const field of BODY_FIELDS) if (Object.prototype.hasOwnProperty.call(body, field)) data[field] = body[field];
  for (const field of TEXT_FIELDS) {
    if (data[field] !== undefined) {
      if (typeof data[field] !== "string") throw error(`${field} must be a string`);
      data[field] = data[field].trim();
    }
  }
  if (data.role) data.role = data.role.toUpperCase();
  if (data.email) data.email = data.email.toLowerCase();
  for (const field of ["startDate", "endDate"]) if (data[field] !== undefined) data[field] = parseDate(data[field], field);
  if (data.endDate) data.isOngoing = false;
  return data;
};

const validateObjectId = (value, field, code) => {
  if (!mongoose.Types.ObjectId.isValid(value) || !/^[a-f\d]{24}$/i.test(value)) throw error(`Invalid ${field}`, code);
};

const validateData = (data) => {
  if (data.societyId !== undefined) validateObjectId(data.societyId, "society ID", "INVALID_SOCIETY_ID");
  if (data.userId !== undefined) validateObjectId(data.userId, "user ID", "INVALID_USER_ID");
  if (data.role !== undefined && !/^[A-Z0-9][A-Z0-9_-]*$/.test(data.role)) throw error("Invalid leadership role", "INVALID_LEADERSHIP_ROLE");
  if (data.name !== undefined && (data.name.length < 2 || data.name.length > 150)) throw error("name must be between 2 and 150 characters");
  if (data.email !== undefined && !EMAIL_PATTERN.test(data.email)) throw error("email must be valid");
  for (const [field, max] of [["contactNumber", 20], ["designation", 200], ["department", 200]]) {
    if (data[field] !== undefined && data[field].length > max) throw error(`${field} cannot exceed ${max} characters`);
  }
  if (data.academicSession !== undefined && !ACADEMIC_SESSION_PATTERN.test(data.academicSession)) throw error("academicSession must use YYYY-YY format", "INVALID_ACADEMIC_SESSION");
  for (const field of ["isOngoing", "notificationEnabled"]) if (data[field] !== undefined && typeof data[field] !== "boolean") throw error(`${field} must be a boolean`);
  if (data.isOngoing === true && data.endDate) throw error("Ongoing assignments cannot have an endDate", "INVALID_DATE_RANGE");
  if (data.startDate && data.endDate && data.endDate < data.startDate) throw error("endDate cannot be before startDate", "INVALID_DATE_RANGE");
  if (data.status !== undefined && ![LEADERSHIP_STATUSES.ACTIVE, LEADERSHIP_STATUSES.INACTIVE].includes(data.status)) throw error("status must be ACTIVE or INACTIVE");
  if (data.metadata !== undefined && (data.metadata === null || Array.isArray(data.metadata) || typeof data.metadata !== "object")) throw error("metadata must be an object");
  for (const field of ["createdBy", "updatedBy"]) if (data[field] !== undefined) validateObjectId(data[field], field, "VALIDATION_ERROR");
};

const validateCreate = (req, res, next) => {
  try {
    const data = normalize(req.body || {});
    for (const field of ["societyId", "role", "academicSession"]) if (!data[field]) throw error(`${field} is required`);
    if (!data.userId && (!data.name || !data.email)) throw error("userId or legacy name/email identity is required");
    validateData(data);
    req.body = data;
    next();
  } catch (caught) { next(caught); }
};

const validateUpdate = (req, res, next) => {
  try {
    const data = normalize(req.body || {});
    if (!Object.keys(data).length) throw error("At least one valid field is required");
    validateData(data);
    req.body = data;
    next();
  } catch (caught) { next(caught); }
};

const validateEnd = (req, res, next) => {
  try {
    if (!req.body?.endDate) throw error("endDate is required", "INVALID_DATE_RANGE");
    const endDate = parseDate(req.body.endDate, "endDate");
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) throw error("reason is required");
    req.body = { endDate, reason };
    next();
  } catch (caught) { next(caught); }
};

const validateStatus = (req, res, next) => {
  try {
    const status = typeof req.body?.status === "string" ? req.body.status.trim().toUpperCase() : "";
    if (![LEADERSHIP_STATUSES.ACTIVE, LEADERSHIP_STATUSES.INACTIVE].includes(status)) throw error("status must be ACTIVE or INACTIVE");
    req.body = { status };
    next();
  } catch (caught) { next(caught); }
};

const positiveInteger = (value, fallback, field) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw error(`${field} must be a positive integer`);
  return Number(value);
};

const validateList = (req, res, next) => {
  try {
    const page = positiveInteger(req.query.page, PAGINATION.DEFAULT_PAGE, "page");
    const limit = positiveInteger(req.query.limit, PAGINATION.DEFAULT_LIMIT, "limit");
    if (limit > PAGINATION.MAX_LIMIT) throw error(`limit cannot exceed ${PAGINATION.MAX_LIMIT}`);
    const filters = { page, limit };
    for (const field of ["societyId", "role", "academicSession", "status", "email", "search"]) if (req.query[field] !== undefined) filters[field] = req.query[field].trim();
    if (filters.societyId) validateObjectId(filters.societyId, "society ID", "INVALID_SOCIETY_ID");
    if (filters.role) { filters.role = filters.role.toUpperCase(); if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(filters.role)) throw error("Invalid leadership role", "INVALID_LEADERSHIP_ROLE"); }
    if (filters.academicSession && !ACADEMIC_SESSION_PATTERN.test(filters.academicSession)) throw error("academicSession must use YYYY-YY format", "INVALID_ACADEMIC_SESSION");
    if (filters.status) { filters.status = filters.status.toUpperCase(); if (!Object.values(LEADERSHIP_STATUSES).includes(filters.status)) throw error("Invalid leadership status"); }
    if (filters.email) filters.email = filters.email.toLowerCase();
    if (req.query.isOngoing !== undefined) {
      if (!["true", "false"].includes(req.query.isOngoing)) throw error("isOngoing must be true or false");
      filters.isOngoing = req.query.isOngoing === "true";
    }
    req.leadershipFilters = filters;
    next();
  } catch (caught) { next(caught); }
};

const validateActive = (req, res, next) => {
  try {
    validateObjectId(req.params.societyId, "society ID", "INVALID_SOCIETY_ID");
    const academicSession = req.query.academicSession?.trim();
    if (academicSession && !ACADEMIC_SESSION_PATTERN.test(academicSession)) throw error("academicSession must use YYYY-YY format", "INVALID_ACADEMIC_SESSION");
    req.academicSession = academicSession;
    next();
  } catch (caught) { next(caught); }
};

module.exports = { validateCreate, validateUpdate, validateEnd, validateStatus, validateList, validateActive };
