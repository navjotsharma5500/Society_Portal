const AppError = require("../../common/errors/AppError"),
  service = require("./authorization.service");
const requirePermission =
  (permissionCode, options = {}) =>
  async (req, res, next) => {
    try {
      const userId = req.auth?.userId || req.user?._id || req.user?.id;
      if (!userId)
        throw new AppError(
          "Authentication context is missing",
          401,
          "AUTHORIZATION_CONTEXT_MISSING"
        );
      const source = options.societyIdFrom || "params",
        key = options.societyIdKey || "societyId",
        societyId = req[source]?.[key];
      const result = await service.hasPermission({
        userId,
        permissionCode,
        societyId,
        resourceOwnerId: options.resourceOwnerIdFrom
          ? req[options.resourceOwnerIdFrom]?.[
              options.resourceOwnerIdKey || "userId"
            ]
          : undefined,
        user: req.auth?.user,
        context: req.authorizationContext,
      });
      if (!result.allowed)
        throw new AppError(
          "Permission denied",
          403,
          result.reason === "AUTHORIZATION_CONTEXT_MISSING"
            ? result.reason
            : "PERMISSION_DENIED"
        );
      req.authorization = result;
      next();
    } catch (e) {
      next(e);
    }
  };
const attachDevelopmentUser = (req, res, next) => {
  if (
    process.env.ALLOW_DEVELOPMENT_USER !== "true" ||
    process.env.NODE_ENV === "production"
  )
    return next();
  const id = req.get("x-development-user-id");
  if (id) req.user = { _id: id };
  next();
};
module.exports = { requirePermission, attachDevelopmentUser };
