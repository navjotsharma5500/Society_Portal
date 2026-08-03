const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");

const app = express();

app.use(helmet());

app.use(compression());

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(morgan("dev"));

app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    application: "Society Portal",
    version: "0.1.0",
    status: "Running",
    timestamp: new Date(),
  });
});

module.exports = app;