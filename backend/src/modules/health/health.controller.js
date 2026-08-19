const timedRequire = (label, path) => {
  const started = process.hrtime.bigint();
  const result = require(path);
  if (process.env.NODE_ENV === "development") {
    const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    if (ms >= 50) console.info(`[startup] require health.controller -> ${label}: ${ms}ms`);
  }
  return result;
};
const mongoose = timedRequire("mongoose", "mongoose");
const environment = timedRequire("environment", "../../config/environment");
const { version } = timedRequire("package.json", "../../../package.json");
const realtime = timedRequire("realtimePublisher", "../../realtime/realtimePublisher");
const redis = timedRequire("redisClient", "../../cache/redisClient"),
  cache = timedRequire("cacheService", "../../cache/cacheService");

const databaseStates = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      application: "TIET Society Portal",
      version,
      environment: environment.nodeEnv,
      status: "healthy",
      database:
        databaseStates[mongoose.connection.readyState] || "unknown",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      realtime: { enabled: realtime.isEnabled() },
      cache: { enabled: redis.isEnabled(), status: redis.getStatus() === "CONNECTED" ? "connected" : redis.getStatus() === "DISABLED" ? "disabled" : "degraded", metrics: cache.metrics() },
    },
  });
};

module.exports = { getHealth };
