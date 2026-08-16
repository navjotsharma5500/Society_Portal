const VENUE_TYPES = Object.freeze([
  "AUDITORIUM",
  "HALL",
  "LECTURE_ROOM",
  "SEMINAR_ROOM",
  "OPEN_AREA",
  "MEETING_ROOM",
  "OTHER",
]);
const BOOKING_STATUSES = Object.freeze(["ENABLED", "DISABLED"]);
const RECORD_STATUSES = Object.freeze(["ACTIVE", "INACTIVE"]);

const friendlyLabel = (value) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeEnum = (value, allowedValues) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return allowedValues.includes(normalized) ? normalized : null;
};

module.exports = {
  VENUE_TYPES,
  BOOKING_STATUSES,
  RECORD_STATUSES,
  friendlyLabel,
  normalizeEnum,
};
