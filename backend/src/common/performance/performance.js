const environment = require("../../config/environment");
const enabled = environment.nodeEnv === "development";
const now = () => Number(process.hrtime.bigint()) / 1e6;
const mark = (req, key, startedAt) => { if (enabled && req) { req.performance ||= {}; req.performance[key] = Math.round((now() - startedAt) * 10) / 10; } };
const log = (name, values) => { if (enabled) console.info(`[perf] ${name}`, values); };
const requestTiming = (req, res, next) => {
  if (!enabled) return next();
  const startedAt = now();
  res.on("finish", () => log(req.performanceLabel || `${req.method} ${req.route?.path || req.path}`, { ...(req.performance || {}), totalMs: Math.round((now() - startedAt) * 10) / 10, status: res.statusCode }));
  next();
};
module.exports = { enabled, now, mark, log, requestTiming };
