const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const environment = require("./config/environment");
const healthRoutes = require("./modules/health/health.routes");
const societyRoutes = require("./modules/societies/society.routes");
const notFound = require("./common/middleware/notFound.middleware");
const errorMiddleware = require("./common/middleware/error.middleware");

const app = express();

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: environment.frontendUrl,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

if (environment.nodeEnv === "development") {
  app.use(morgan("dev"));
}

app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/societies", societyRoutes);

app.use(notFound);
app.use(errorMiddleware);

module.exports = app;
