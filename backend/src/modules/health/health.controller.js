const mongoose = require("mongoose");
const environment = require("../../config/environment");
const { version } = require("../../../package.json");

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
    },
  });
};

module.exports = { getHealth };
