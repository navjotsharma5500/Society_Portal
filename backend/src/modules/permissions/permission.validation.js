const AppError = require("../../common/errors/AppError");
const {
  PERMISSION_TYPES,
  PERMISSION_STATUSES,
  PERMISSION_MODULES,
  PAGINATION,
} = require("./permission.constants");
const fail = (m) => {
  throw new AppError(m, 400, "VALIDATION_ERROR");
};
const fields = [
  "code",
  "name",
  "description",
  "module",
  "resource",
  "action",
  "permissionType",
  "uiKey",
  "route",
  "httpMethod",
  "apiPattern",
  "category",
  "sortOrder",
  "isSystemPermission",
  "status",
  "metadata",
  "createdBy",
  "updatedBy",
];
const clean = (b) =>
  Object.fromEntries(
    fields
      .filter((k) => b[k] !== undefined)
      .map((k) => [k, typeof b[k] === "string" ? b[k].trim() : b[k]])
  );
const check = (d) => {
  if (d.code !== undefined && !/^[a-z0-9][a-z0-9._-]*$/.test(d.code))
    fail("code has an invalid format");
  if (d.name !== undefined && (!d.name || d.name.length > 150))
    fail("name is required and cannot exceed 150 characters");
  if (d.description?.length > 1000)
    fail("description cannot exceed 1000 characters");
  if (d.module !== undefined && !PERMISSION_MODULES.includes(d.module))
    fail("invalid module");
  if (
    d.permissionType !== undefined &&
    !Object.values(PERMISSION_TYPES).includes(d.permissionType)
  )
    fail("invalid permissionType");
  if (
    d.status !== undefined &&
    !Object.values(PERMISSION_STATUSES).includes(d.status)
  )
    fail("invalid status");
};
const body =
  (required = false) =>
  (req, res, next) => {
    try {
      const d = clean(req.body || {});
      if (required)
        for (const k of [
          "code",
          "name",
          "module",
          "resource",
          "action",
          "permissionType",
        ])
          if (!d[k]) fail(`${k} is required`);
      if (!Object.keys(d).length) fail("At least one valid field is required");
      check(d);
      req.body = d;
      next();
    } catch (e) {
      next(e);
    }
  };
const list = (req, res, next) => {
  try {
    const page = Number(req.query.page || PAGINATION.DEFAULT_PAGE),
      limit = Number(req.query.limit || PAGINATION.DEFAULT_LIMIT);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > PAGINATION.MAX_LIMIT
    )
      fail("invalid pagination");
    req.permissionFilters = { ...req.query, page, limit };
    next();
  } catch (e) {
    next(e);
  }
};
const status = (req, res, next) => {
  try {
    if (!Object.values(PERMISSION_STATUSES).includes(req.body?.status))
      fail("invalid status");
    next();
  } catch (e) {
    next(e);
  }
};
module.exports = {
  validateCreate: body(true),
  validateUpdate: body(),
  validateList: list,
  validateStatus: status,
};
