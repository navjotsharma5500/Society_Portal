const processEntry = process.hrtime.bigint();
const elapsed = () => Math.round(Number(process.hrtime.bigint() - processEntry) / 1e6);
const startup = (phase, duration) => process.env.NODE_ENV === "development" && console.info(`[startup] ${phase}: ${duration}ms`);
const configStarted = elapsed();
const environment = require("./config/environment");
startup("environment/config loaded", elapsed()-configStarted);
const modulesStarted = elapsed();
const app = require("./app");
const http = require("node:http");
const { initializeRealtime, closeRealtime } = require("./realtime/socketServer");
const redis = require("./cache/redisClient");
const {
  connectDatabase,
  disconnectDatabase,
} = require("./config/database");
startup("app modules loaded", elapsed()-modulesStarted);

let server;
let isShuttingDown = false;

const shutdown = async (signal, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received. Shutting down gracefully...`);

  try {
    if (server) {
      await closeRealtime();
      await redis.close();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }

    await disconnectDatabase();
    console.log("Graceful shutdown complete");
    process.exit(exitCode);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  shutdown("uncaughtException", 1);
});

const startServer = async () => {
  try {
    const mongoStarted=elapsed(); startup("mongo connection start",mongoStarted);
    await connectDatabase();
    startup("mongo connected",elapsed()-mongoStarted);
    const redisStarted=elapsed(); startup("redis initialization start",redisStarted);
    const redisReady=redis.initialize();

    server = http.createServer(app);
    const socketStarted=elapsed();
    initializeRealtime(server);
    startup("Socket.IO initialized",elapsed()-socketStarted);
    const listenStarted=elapsed(); startup("HTTP listen start",listenStarted);
    server.listen(environment.port, () => {
      startup("HTTP listening",elapsed()-listenStarted);
      Promise.resolve(redisReady).finally(()=>{startup(`redis ${redis.getStatus().toLowerCase()}`,elapsed()-redisStarted);startup("total ready",elapsed());});
      console.log(
        `TIET Society Portal backend listening on port ${environment.port} (${environment.nodeEnv})`
      );
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  }
};

startServer();
