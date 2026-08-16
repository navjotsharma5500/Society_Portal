const { EventEmitter } = require("node:events");
const bus = new EventEmitter();
bus.setMaxListeners(50);
const publish = (
  eventType,
  { userId = null, studentMasterId = null, metadata = {} } = {}
) => {
  const event = {
    eventType,
    userId: userId ? String(userId) : null,
    studentMasterId: studentMasterId ? String(studentMasterId) : null,
    occurredAt: new Date().toISOString(),
    metadata,
  };
  bus.emit(eventType, event);
  bus.emit("*", event);
  return event;
};
const subscribe = (eventType, listener) => {
  bus.on(eventType, listener);
  return () => bus.off(eventType, listener);
};
module.exports = { publish, subscribe };
