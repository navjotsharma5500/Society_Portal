const mongoose = require("mongoose");
const environment = require("./environment");

const connectDatabase = async () => {
  if (mongoose.connection.readyState === 1) return mongoose;
  const startedAt = Date.now();
  const connection = await mongoose.connect(environment.mongodbUri, {
    maxPoolSize: 20,
    minPoolSize: environment.nodeEnv === "development" ? 2 : 5,
    maxConnecting: 4,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    waitQueueTimeoutMS: 5000,
  });

  console.log(
    `MongoDB connected to ${connection.connection.host}/${connection.connection.name} in ${Date.now() - startedAt}ms (pool 2-20)`
  );
  if (environment.nodeEnv === "development") {
    const client = connection.connection.getClient();
    const checkouts = new Map();
    client.on("connectionCheckOutStarted", (event) => checkouts.set(event.operationId, process.hrtime.bigint()));
    client.on("connectionCheckedOut", (event) => { const start=checkouts.get(event.operationId); checkouts.delete(event.operationId); if(start){const durationMs=Number(process.hrtime.bigint()-start)/1e6;if(durationMs>=100)console.warn("[perf] mongo.pool.checkout_slow",{durationMs:Math.round(durationMs)});}});
    client.on("connectionCheckOutFailed", (event) => { checkouts.delete(event.operationId); console.warn("[perf] mongo.pool.checkout_failed", { reason: event.reason }); });
    client.on("connectionPoolCleared", (event) => console.warn("[perf] mongo.pool.cleared", { address:event.address }));
    client.on("connectionClosed", (event) => { if(!["poolClosed","stale"].includes(event.reason)) console.warn("[perf] mongo.connection.closed",{reason:event.reason}); });
  }
  return connection;
};

const disconnectDatabase = async () => {
  await mongoose.disconnect();
};

module.exports = { connectDatabase, disconnectDatabase };
