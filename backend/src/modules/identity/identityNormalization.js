const normalizeEmail = (value) => String(value || "").trim().replace(/\s+/g, "").toLowerCase();
const normalizeRollNumber = (value) => String(value || "").trim().replace(/\s+/g, "").toUpperCase();
const normalizeContact = (value) => { let digits = String(value || "").trim().replace(/\D/g, ""); if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2); if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1); return digits; };
module.exports = { normalizeEmail, normalizeRollNumber, normalizeContact };
