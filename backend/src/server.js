const environment = require("./config/environment");
const app = require("./app");
const {
  connectDatabase,
  disconnectDatabase,
} = require("./config/database");

let server;
let isShuttingDown = false;

const shutdown = async (signal, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received. Shutting down gracefully...`);

  try {
    if (server) {
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
    await connectDatabase();

    server = app.listen(environment.port, () => {
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
