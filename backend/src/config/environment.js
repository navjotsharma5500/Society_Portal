const dotenv = require("dotenv");

dotenv.config({ quiet: true });

const requiredVariables = [
  "NODE_ENV",
  "PORT",
  "MONGODB_URI",
  "FRONTEND_URL",
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

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV,
  port,
  mongodbUri: process.env.MONGODB_URI,
  frontendUrl: process.env.FRONTEND_URL,
});
