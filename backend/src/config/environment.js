const dotenv = require("dotenv");

dotenv.config({ quiet: true });

const requiredVariables = [
  "NODE_ENV",
  "PORT",
  "MONGODB_URI",
  "FRONTEND_URL",
  "GOOGLE_CLIENT_ID",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
];

const missingVariables = requiredVariables.filter(
  (variable) => !process.env[variable] || !process.env[variable].trim()
);

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missingVariables.join(", ")}`
  );
}

const port = Number(process.env.PORT);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

for (const secret of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
  if (process.env[secret].length < 32) throw new Error(`${secret} must contain at least 32 characters`);
}
const positiveInteger = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};
const booleanValue = (name, fallback) => {
  const value = String(process.env[name] ?? fallback).toLowerCase();
  if (!["true", "false"].includes(value)) throw new Error(`${name} must be true or false`);
  return value === "true";
};
const cookieSameSite = String(process.env.COOKIE_SAME_SITE || "lax").toLowerCase();
if (!["lax", "strict", "none"].includes(cookieSameSite)) throw new Error("COOKIE_SAME_SITE must be lax, strict or none");
const cookieSecure = booleanValue("COOKIE_SECURE", false);
const superAdminEmails = [...new Set(String(process.env.SUPER_ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean))];
const redisEnabled = booleanValue("REDIS_ENABLED", false);
if (process.env.NODE_ENV === "production" && !cookieSecure) throw new Error("COOKIE_SECURE must be true in production");
if (cookieSameSite === "none" && !cookieSecure) throw new Error("COOKIE_SECURE must be true when COOKIE_SAME_SITE is none");

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV,
  port,
  mongodbUri: process.env.MONGODB_URI,
  frontendUrl: process.env.FRONTEND_URL,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenTtlMinutes: positiveInteger("ACCESS_TOKEN_TTL_MINUTES", 15),
  refreshTokenTtlDays: positiveInteger("REFRESH_TOKEN_TTL_DAYS", 30),
  cookieSecure,
  cookieSameSite,
  superAdminEmails,
  redisEnabled,
  redisUrl: String(process.env.REDIS_URL || "").trim(),
});
