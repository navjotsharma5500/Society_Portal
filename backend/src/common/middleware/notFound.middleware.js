const AppError = require("../errors/AppError");

const notFound = (req, res, next) => {
  next(
    new AppError(
      `Route ${req.method} ${req.originalUrl} not found`,
      404,
      "ROUTE_NOT_FOUND"
    )
  );
};

module.exports = notFound;
