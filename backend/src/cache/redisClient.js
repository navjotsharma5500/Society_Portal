const { createClient } = require("redis"),
  environment = require("../config/environment");
let client,
  status = environment.redisEnabled ? "DISCONNECTED" : "DISABLED",
  initializing;
const warning = (message) =>
  console.warn(`[redis] ${message}; Mongo fallback active`);
const initialize = async () => {
  if (!environment.redisEnabled) return null;
  if (client?.isReady) return client;
  if (initializing) return initializing;
  if (!environment.redisUrl) {
    warning("URL missing");
    return null;
  }
  if (client?.isOpen) client.destroy?.();
  client = createClient({
    url: environment.redisUrl,
    socket: {
      connectTimeout: 1000,
      reconnectStrategy: (retries) =>
        retries >= 3 ? false : Math.min(250 * 2 ** retries, 1000),
    },
  });
  client.on("ready", () => {
    status = "CONNECTED";
    if (environment.nodeEnv === "development")
      console.info("[redis] connected");
  });
  client.on("reconnecting", () => {
    status = "DISCONNECTED";
    if (environment.nodeEnv === "development")
      console.info("[redis] reconnecting");
  });
  client.on("error", () => {
    status = "DISCONNECTED";
  });
  initializing = client
    .connect()
    .then(() => client)
    .catch(() => {
      status = "DISCONNECTED";
      warning("unavailable");
      return null;
    })
    .finally(() => {
      initializing = null;
    });
  return initializing;
};
const getClient = async () => {
  if (client?.isReady) return client;
  const pending = initialize();
  return Promise.race([
    pending,
    new Promise((resolve) => setTimeout(() => resolve(null), 1750)),
  ]);
};
const close = async () => {
  if (client?.isOpen) client.destroy?.();
  client = undefined;
  status = environment.redisEnabled ? "DISCONNECTED" : "DISABLED";
};
module.exports = {
  initialize,
  getClient,
  close,
  getStatus: () => status,
  isEnabled: () => environment.redisEnabled,
  _setClientForTests: (value) => {
    client = value;
    status = value
      ? "CONNECTED"
      : environment.redisEnabled
      ? "DISCONNECTED"
      : "DISABLED";
  },
};
