const environment = require("../../config/environment");

const normalizeError = (error) => {
  if (error.name === "CastError") {
    return {
      statusCode: 400,
      code: "INVALID_RESOURCE_ID",
      message: "The supplied resource identifier is invalid",
    };
  }

  if (error.code === 11000) {
    return {
      statusCode: 409,
      code: "DUPLICATE_RESOURCE",
      message: "A resource with the supplied value already exists",
    };
  }

  if (error.isOperational) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  };
};

const errorMiddleware = (error, req, res, next) => {
  const normalizedError = normalizeError(error);
  const response = {
    success: false,
    error: {
      code: normalizedError.code,
      message: normalizedError.message,
    },
  };

  if (environment.nodeEnv === "development") {
    response.error.stack = error.stack;
  }

  res.status(normalizedError.statusCode).json(response);
};

module.exports = errorMiddleware;
