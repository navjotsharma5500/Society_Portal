const AppError = require("../../common/errors/AppError");
const { SOCIETY_STATUSES, PAGINATION } = require("./society.constants");

const allowedFields = [
  "name",
  "code",
  "shortName",
  "description",
  "category",
  "email",
  "contactNumber",
  "logoUrl",
  "academicSession",
  "isActive",
  "status",
  "metadata",
  "createdBy",
  "updatedBy",
];
const stringFields = [
  "name",
  "code",
  "shortName",
  "description",
  "category",
  "email",
  "contactNumber",
  "logoUrl",
  "academicSession",
];

const validationError = (message) =>
  new AppError(message, 400, "VALIDATION_ERROR");

const normalizeBody = (body) => {
  const normalized = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      normalized[field] = body[field];
    }
  }

  for (const field of stringFields) {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      if (typeof normalized[field] !== "string") {
        throw validationError(`${field} must be a string`);
      }
      normalized[field] = normalized[field].trim();
    }
  }

  if (normalized.code) normalized.code = normalized.code.toUpperCase();
  if (normalized.email) normalized.email = normalized.email.toLowerCase();

  return normalized;
};

const validateFields = (data) => {
  if (data.name !== undefined && (data.name.length < 2 || data.name.length > 150)) {
    throw validationError("name must be between 2 and 150 characters");
  }
  if (data.category !== undefined && data.category.length === 0) {
    throw validationError("category cannot be empty");
  }
  if (data.shortName !== undefined && data.shortName.length > 50) {
    throw validationError("shortName cannot exceed 50 characters");
  }
  if (data.description !== undefined && data.description.length > 2000) {
    throw validationError("description cannot exceed 2000 characters");
  }
  if (data.isActive !== undefined && typeof data.isActive !== "boolean") {
    throw validationError("isActive must be a boolean");
  }
  if (data.status !== undefined && !Object.values(SOCIETY_STATUSES).includes(data.status)) {
    throw validationError("status must be ACTIVE or INACTIVE");
  }
  if (
    data.metadata !== undefined &&
    (data.metadata === null || Array.isArray(data.metadata) || typeof data.metadata !== "object")
  ) {
    throw validationError("metadata must be an object");
  }
};

const validateCreate = (req, res, next) => {
  try {
    const data = normalizeBody(req.body || {});
    for (const field of ["name", "category"]) {
      if (!data[field]) throw validationError(`${field} is required`);
    }
    validateFields(data);
    req.body = data;
    next();
  } catch (error) {
    next(error);
  }
};

const validateUpdate = (req, res, next) => {
  try {
    const data = normalizeBody(req.body || {});
    if (Object.keys(data).length === 0) {
      throw validationError("At least one valid field is required");
    }
    validateFields(data);
    req.body = data;
    next();
  } catch (error) {
    next(error);
  }
};

const validateStatusUpdate = (req, res, next) => {
  try {
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    if (!Object.values(SOCIETY_STATUSES).includes(status)) {
      throw validationError("status must be ACTIVE or INACTIVE");
    }
    req.body = { status };
    next();
  } catch (error) {
    next(error);
  }
};

const parsePositiveInteger = (value, fallback, field) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw validationError(`${field} must be a positive integer`);
  }
  return Number(value);
};

const validateList = (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, PAGINATION.DEFAULT_PAGE, "page");
    const limit = parsePositiveInteger(req.query.limit, PAGINATION.DEFAULT_LIMIT, "limit");
    if (limit > PAGINATION.MAX_LIMIT) {
      throw validationError(`limit cannot exceed ${PAGINATION.MAX_LIMIT}`);
    }

    let isActive;
    if (req.query.isActive !== undefined) {
      if (!['true', 'false'].includes(req.query.isActive)) {
        throw validationError("isActive must be true or false");
      }
      isActive = req.query.isActive === "true";
    }

    const status = req.query.status?.trim();
    if (status && !Object.values(SOCIETY_STATUSES).includes(status)) {
      throw validationError("status must be ACTIVE or INACTIVE");
    }

    req.societyFilters = {
      search: req.query.search?.trim(),
      status,
      category: req.query.category?.trim(),
      isActive,
      page,
      limit,
    };
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateCreate,
  validateUpdate,
  validateStatusUpdate,
  validateList,
};
