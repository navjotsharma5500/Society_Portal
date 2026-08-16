const environment = require("../../config/environment");

const normalizeError = (error) => {
  if (error.code === "LIMIT_FILE_SIZE") {
    return { statusCode: 413, code: "PROFILE_PHOTO_TOO_LARGE", message: "Profile photo must be 1 MB or smaller." };
  }
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
  if (environment.nodeEnv === "development") {
    const eventSubmit = req.method === "POST" && /^\/api\/v1\/events\/[^/]+\/submit$/.test(req.originalUrl.split("?")[0]), eventUpdate=req.method==="PATCH"&&/^\/api\/v1\/events\/[^/]+$/.test(req.originalUrl.split("?")[0]),eventOperation=eventSubmit||eventUpdate;
    console.warn(eventOperation ? "[events] operation failed" : "[api] request failed", eventOperation ? {
      module: "events",
      operation: eventSubmit ? "submit" : "updateDraft",
      eventId: req.params?.eventId,
      status: normalizedError.statusCode,
      code: normalizedError.code,
      message: normalizedError.message,
      fields: error.fields || [],
    } : {method:req.method,path:req.originalUrl.split("?")[0],status:normalizedError.statusCode,code:normalizedError.code,message:normalizedError.message});
  }
  const response = {
    success: false,
    error: {
      code: normalizedError.code,
      message: normalizedError.message,
    },
  };
  if (error.fields) response.error.fields = error.fields;
  if (error.metadata) response.error.metadata = error.metadata;
  if (error.reference) response.error.reference = error.reference;

  res.status(normalizedError.statusCode).json(response);
};

module.exports = errorMiddleware;
