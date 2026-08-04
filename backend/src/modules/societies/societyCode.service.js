const CODE_PATTERN = /^(?=.*[A-Z])[A-Z0-9_-]{6,10}$/;
const STOP_WORDS = new Set(["AND", "OF", "THE", "FOR", "AT"]);

const normalizeSocietyCode = (value) => String(value || "")
  .trim()
  .toUpperCase()
  .replace(/\s+/g, "_")
  .replace(/[^A-Z0-9_-]/g, "")
  .replace(/_+/g, "_")
  .replace(/^[_-]+|[_-]+$/g, "")
  .slice(0, 10);

const isValidSocietyCode = (value) => CODE_PATTERN.test(normalizeSocietyCode(value));

const buildBaseCode = (name) => {
  const normalizedName = String(name || "").toUpperCase();
  const parentheticalAcronym = normalizedName.match(/\(([A-Z][A-Z0-9]{1,7})\)/)?.[1];
  const words = normalizedName.match(/[A-Z0-9]+/g) || [];
  const meaningful = words.filter((word) => !STOP_WORDS.has(word));
  const initials = meaningful.map((word) => word[0]).join("");
  let base = parentheticalAcronym || (initials.length >= 3 ? initials.slice(0, 8) : (meaningful[0] || "SOCIETY").slice(0, 8));
  if (!/[A-Z]/.test(base)) base = "SOC";
  if (base.length < 6) {
    const suffixLength = Math.max(2, 6 - base.length);
    base = `${base}${String(1).padStart(suffixLength, "0")}`;
  }
  return normalizeSocietyCode(base);
};

const generateSocietyCode = async ({ name, campus, usedCodes = new Set(), isCodeTaken }) => {
  const base = buildBaseCode(name);
  const campusSuffix = campus === "DERA_BASSI" ? "DB" : campus === "PATIALA" ? "PT" : "";
  const candidates = [base];
  if (campusSuffix) candidates.push(`${base.slice(0, 8)}${campusSuffix}`.slice(0, 10));
  for (let number = 1; number <= 9999; number += 1) {
    const suffix = String(number).padStart(2, "0");
    candidates.push(`${base.slice(0, 10 - suffix.length)}${suffix}`);
  }
  for (const candidate of candidates) {
    if (!usedCodes.has(candidate) && !(await isCodeTaken?.(candidate))) return candidate;
  }
  return null;
};

const prepareSocietyCode = async ({ suppliedCode, name, campus, usedCodes, isCodeTaken }) => {
  const normalizedSupplied = normalizeSocietyCode(suppliedCode);
  if (isValidSocietyCode(normalizedSupplied)) {
    return { code: normalizedSupplied, regenerated: false };
  }
  const code = await generateSocietyCode({ name, campus, usedCodes, isCodeTaken });
  return { code, regenerated: Boolean(suppliedCode) };
};

module.exports = {
  CODE_PATTERN,
  normalizeSocietyCode,
  isValidSocietyCode,
  generateSocietyCode,
  prepareSocietyCode,
};
