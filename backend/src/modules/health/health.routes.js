const express = require("express");
const timedRequire = (label, path) => {
  const started = process.hrtime.bigint();
  const result = require(path);
  if (process.env.NODE_ENV === "development") {
    const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    if (ms >= 50) console.info(`[startup] require health.routes -> ${label}: ${ms}ms`);
  }
  return result;
};
const { getHealth } = timedRequire("health.controller", "./health.controller");

const router = express.Router();

router.get("/", getHealth);

module.exports = router;
