const AppError = require("../../common/errors/AppError");
const {
  ACCOUNT_TYPES,
  USER_STATUSES,
  PAGINATION,
} = require("./user.constants");
const fail = (m) => {
  throw new AppError(m, 400, "VALIDATION_ERROR");
};
const page = (v, d, n) => {
  if (v === undefined) return d;
  if (!/^\d+$/.test(v) || +v < 1) fail(`${n} must be positive`);
  return +v;
};
const validateCreate = (req, res, next) => {
  try {
    const fields = [
        "displayName",
        "email",
        "accountType",
        "status",
        "isLoginAllowed",
        "profilePictureUrl",
        "metadata",
      ],
      d = Object.fromEntries(
        fields
          .filter((k) => req.body?.[k] !== undefined)
          .map((k) => [
            k,
            typeof req.body[k] === "string" ? req.body[k].trim() : req.body[k],
          ])
      );
    d.email = String(d.email || "")
      .trim()
      .toLowerCase();
    if (!d.displayName || d.displayName.length > 150)
      fail("Display name is required and must be at most 150 characters");
    if (!/^\S+@\S+\.\S+$/.test(d.email)) fail("A valid email is required");
    if (d.profilePictureUrl && !/^https?:\/\/\S+$/i.test(d.profilePictureUrl)) fail("A valid profile picture URL is required");
    if (
      !Object.values(ACCOUNT_TYPES).includes(d.accountType) ||
      d.accountType === ACCOUNT_TYPES.STUDENT
    )
      fail("A supported non-student accountType is required");
    if (
      d.status !== undefined &&
      !Object.values(USER_STATUSES).includes(d.status)
    )
      fail("Invalid status");
    if (d.isLoginAllowed !== undefined && typeof d.isLoginAllowed !== "boolean")
      fail("isLoginAllowed must be boolean");
    if (
      d.metadata !== undefined &&
      (d.metadata === null ||
        Array.isArray(d.metadata) ||
        typeof d.metadata !== "object")
    )
      fail("metadata must be an object");
    req.body = d;
    next();
  } catch (e) {
    next(e);
  }
};
const validateList = (req, res, next) => {
  try {
    const limit = page(req.query.limit, PAGINATION.DEFAULT_LIMIT, "limit");
    if (limit > PAGINATION.MAX_LIMIT) fail("limit cannot exceed 100");
    const accountType = req.query.accountType?.trim(),
      status = req.query.status?.trim();
    if (accountType && !Object.values(ACCOUNT_TYPES).includes(accountType))
      fail("Invalid accountType");
    if (status && !Object.values(USER_STATUSES).includes(status))
      fail("Invalid status");
    let isLoginAllowed;
    if (req.query.isLoginAllowed !== undefined) {
      if (!["true", "false"].includes(req.query.isLoginAllowed))
        fail("isLoginAllowed must be true or false");
      isLoginAllowed = req.query.isLoginAllowed === "true";
    }
    req.userFilters = {
      email: req.query.email?.trim().toLowerCase(),
      accountType,
      status,
      isLoginAllowed,
      page: page(req.query.page, 1, "page"),
      limit,
    };
    next();
  } catch (e) {
    next(e);
  }
};
const validateUpdate = (req,res,next) => { try { const fields=["displayName","accountType","profilePictureUrl","metadata"],d=Object.fromEntries(fields.filter(k=>req.body?.[k]!==undefined).map(k=>[k,typeof req.body[k]==="string"?req.body[k].trim():req.body[k]])); if(!Object.keys(d).length)fail("At least one editable field is required");if(d.displayName!==undefined&&(!d.displayName||d.displayName.length>150))fail("Invalid display name");if(d.accountType!==undefined&&(!Object.values(ACCOUNT_TYPES).includes(d.accountType)||d.accountType===ACCOUNT_TYPES.STUDENT))fail("Invalid account type");if(d.profilePictureUrl&&!/^https?:\/\/\S+$/i.test(d.profilePictureUrl))fail("Invalid profile picture URL");if(d.metadata!==undefined&&(d.metadata===null||Array.isArray(d.metadata)||typeof d.metadata!=="object"))fail("metadata must be an object");req.body=d;next()}catch(e){next(e)} };
const validateStatus = (req, res, next) => {
  try {
    const status = req.body?.status,
      reason = String(req.body?.reason || "").trim();
    if (!Object.values(USER_STATUSES).includes(status)) fail("Invalid status");
    if (!reason || reason.length > 1000)
      fail("A reason of at most 1000 characters is required");
    req.body = { status, reason };
    next();
  } catch (e) {
    next(e);
  }
};
const validateLogin = (req, res, next) => {
  try {
    if (typeof req.body?.isLoginAllowed !== "boolean")
      fail("isLoginAllowed must be boolean");
    const reason = String(req.body?.reason || "").trim();
    if (!reason || reason.length > 1000)
      fail("A reason of at most 1000 characters is required");
    req.body = { isLoginAllowed: req.body.isLoginAllowed, reason };
    next();
  } catch (e) {
    next(e);
  }
};
module.exports = {
  validateCreate,
  validateList,
  validateUpdate,
  validateStatus,
  validateLogin,
};
