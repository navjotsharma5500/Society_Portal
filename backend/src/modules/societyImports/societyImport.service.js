const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Society = require("../societies/society.model");
const Session = require("./models/societyImportSession.model");
const {
  IMPORT_STATUSES,
  ENTITY_TYPES,
  CAMPUSES,
  CATEGORY_BY_ENTITY_TYPE,
  SECTION_MAPPINGS,
} = require("./societyImport.constants");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanText = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if (value.text) value = value.text;
    else if (value.result !== undefined) value = value.result;
    else if (Array.isArray(value.richText)) value = value.richText.map((item) => item.text).join("");
  }
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned || null;
};
const cleanEmail = (value) => cleanText(value)?.replace(/\s/g, "").toLowerCase() || null;
const normalizeKey = (value) => (cleanText(value) || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normalizeName = (value) => normalizeKey(value);
const normalizeCode = (value) => (cleanText(value) || "")
  .toUpperCase().replace(/[._\s/'-]+/g, "_").replace(/[^A-Z0-9_]/g, "")
  .replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

const headerAliases = {
  name: ["society", "club", "club society", "society club", "society name"],
  code: ["society code", "code"],
  officialEmail: ["societies emails", "society official email", "official email"],
  president: ["president", "president name"],
  presidentEmail: ["president s email", "president email"],
  presidentDesignation: ["president designation"],
  entityType: ["entity type"], campus: ["campus"], category: ["category"],
  academicSession: ["academic session"], active: ["active"],
};

const identifyHeaders = (values) => {
  const headers = {};
  values.forEach((value, index) => {
    const key = normalizeKey(value);
    for (const [field, aliases] of Object.entries(headerAliases)) {
      if (aliases.includes(key)) headers[field] = index;
    }
  });
  return headers.name !== undefined && Object.keys(headers).length >= 2 ? headers : null;
};

const identifySection = (values) => {
  const text = normalizeKey(values.filter(Boolean).join(" "));
  return SECTION_MAPPINGS.find((mapping) => text === mapping.heading) || null;
};

const parsePresident = (value, explicitDesignation) => {
  const raw = value === null || value === undefined ? "" : String(value);
  const lines = raw.split(/\r?\n/).map(cleanText).filter(Boolean);
  return {
    name: lines[0] || null,
    email: null,
    designation: cleanText(explicitDesignation) || (lines.length > 1 ? lines.slice(1).join(" ") : null),
  };
};

const makeUniqueCode = (base, campus, usedCodes) => {
  if (!base) return null;
  const withSuffix = (suffix) => {
    const normalizedSuffix = normalizeCode(suffix);
    return `${base.slice(0, Math.max(1, 39 - normalizedSuffix.length))}_${normalizedSuffix}`;
  };
  const candidates = [base, withSuffix(campus)];
  for (const candidate of candidates) if (candidate && !usedCodes.has(candidate)) return candidate;
  let suffix = 2;
  while (suffix < 10000) {
    const candidate = withSuffix(`${campus}_${suffix}`);
    if (!usedCodes.has(candidate)) return candidate;
    suffix += 1;
  }
  return null;
};

const getFirstNonEmptyWorksheet = (workbook) => workbook.worksheets.find((sheet) => {
  let populated = false;
  sheet.eachRow((row) => { if (row.values.some((value, index) => index > 0 && cleanText(value))) populated = true; });
  return populated;
});

const parseWorkbookRows = async (buffer, requestSession) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = getFirstNonEmptyWorksheet(workbook);
  if (!sheet) throw new AppError("The workbook contains no data", 400, "INVALID_EXCEL_FILE");

  const rawRows = [];
  let section = null;
  let headers = null;
  sheet.eachRow((row, rowNumber) => {
    const values = row.values.slice(1).map((value) => value?.text || value);
    if (!values.some((value) => cleanText(value))) return;
    const foundSection = identifySection(values);
    if (foundSection) { section = foundSection; headers = null; return; }
    const foundHeaders = identifyHeaders(values);
    if (foundHeaders) { headers = foundHeaders; return; }
    if (!headers) return;
    const at = (field) => headers[field] === undefined ? null : values[headers[field]];
    const name = cleanText(at("name"));
    if (!name) return;
    const entityType = cleanText(at("entityType"))?.toUpperCase().replace(/[\s/-]+/g, "_") || section?.entityType || null;
    const campus = cleanText(at("campus"))?.toUpperCase().replace(/[\s-]+/g, "_") || section?.campus || null;
    const president = parsePresident(at("president"), at("presidentDesignation"));
    president.email = cleanEmail(at("presidentEmail"));
    rawRows.push({
      rowNumber, name, suppliedCode: cleanText(at("code")), officialEmail: cleanEmail(at("officialEmail")),
      entityType, campus, suppliedCategory: cleanText(at("category")), presidentPreview: president,
      academicSession: cleanText(at("academicSession")) || requestSession,
      active: cleanText(at("active")), sectionRecognized: Boolean(section) || headers.entityType !== undefined,
    });
  });
  return rawRows;
};

const normalizeAndValidateRows = async (rawRows) => {
  const existing = await Society.find({}, { code: 1, email: 1, name: 1, metadata: 1 }).lean();
  const existingCodes = new Set(existing.map((item) => item.code));
  const usedCodes = new Set(existingCodes);
  const uploadKeys = new Set();
  const rows = [];

  for (const raw of rawRows) {
    const warnings = [];
    const errors = [];
    if (!raw.name) errors.push("SOCIETY_NAME_MISSING");
    if (!raw.sectionRecognized || !Object.values(ENTITY_TYPES).includes(raw.entityType) || !Object.values(CAMPUSES).includes(raw.campus)) errors.push("SECTION_NOT_RECOGNIZED");
    const category = CATEGORY_BY_ENTITY_TYPE[raw.entityType] || raw.suppliedCategory || null;
    const baseCode = normalizeCode(raw.suppliedCode || raw.officialEmail?.split("@")[0] || raw.name);
    const code = makeUniqueCode(baseCode, raw.campus, usedCodes);
    if (!code) errors.push("CODE_GENERATION_FAILED");
    if (!raw.officialEmail) warnings.push("SOCIETY_EMAIL_MISSING");
    else if (!EMAIL_PATTERN.test(raw.officialEmail)) warnings.push("SOCIETY_EMAIL_INVALID");
    if (!raw.presidentPreview.name) warnings.push("PRESIDENT_NAME_MISSING");
    if (!raw.presidentPreview.email) warnings.push("PRESIDENT_EMAIL_MISSING");
    else if (!EMAIL_PATTERN.test(raw.presidentPreview.email)) warnings.push("PRESIDENT_EMAIL_INVALID");
    if (![raw.name, code, raw.entityType, raw.campus, category, raw.academicSession].every(Boolean)) errors.push("REQUIRED_FIELD_MISSING");

    const nameCampusKey = `${normalizeName(raw.name)}|${raw.campus}`;
    const uploadKey = raw.officialEmail ? `email:${raw.officialEmail}` : `name:${nameCampusKey}`;
    const existingMatch = existing.some((item) =>
      (raw.officialEmail && item.email === raw.officialEmail) ||
      (normalizeName(item.name) === normalizeName(raw.name) && item.metadata?.campus === raw.campus)
    );
    let action = "IMPORT";
    if (existingMatch) { warnings.push("SOCIETY_ALREADY_EXISTS"); action = "SKIP"; }
    else if (uploadKeys.has(uploadKey)) { warnings.push("DUPLICATE_IN_UPLOAD"); action = "SKIP"; }
    uploadKeys.add(uploadKey);
    if (code) usedCodes.add(code);
    const importable = errors.length === 0 && action !== "SKIP";
    rows.push({
      rowNumber: raw.rowNumber, name: raw.name, code, officialEmail: raw.officialEmail,
      entityType: raw.entityType, campus: raw.campus, category,
      presidentPreview: raw.presidentPreview, academicSession: raw.academicSession,
      status: "ACTIVE", isActive: true, warnings: [...new Set(warnings)],
      errors: [...new Set(errors)], action, importable,
    });
  }
  return rows;
};

const summarize = (rows) => ({
  totalRows: rows.length,
  validRows: rows.filter((row) => row.importable && row.warnings.length === 0).length,
  warningRows: rows.filter((row) => row.warnings.length > 0).length,
  invalidRows: rows.filter((row) => row.errors.length > 0).length,
  skippedRows: rows.filter((row) => row.action === "SKIP").length,
});

const previewImport = async (file, academicSession) => {
  let rawRows;
  try { rawRows = await parseWorkbookRows(file.buffer, academicSession); }
  catch (error) {
    if (error.isOperational) throw error;
    throw new AppError("Unable to read the XLSX workbook", 400, "INVALID_EXCEL_FILE");
  }
  const rows = await normalizeAndValidateRows(rawRows);
  const summary = summarize(rows);
  const session = await Session.create({
    status: IMPORT_STATUSES.PREVIEWED, sourceFileName: file.originalname,
    ...summary, normalizedRows: rows, expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  return { importSessionId: session.id, summary, rows };
};

const findActiveSession = async (id) => {
  const session = await Session.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  if (!session) throw new AppError("Import session not found", 404, "IMPORT_SESSION_NOT_FOUND");
  return session;
};

const getImportSession = async (id) => {
  const session = await findActiveSession(id);
  return { importSessionId: session.id, status: session.status, summary: summarize(session.normalizedRows), rows: session.normalizedRows };
};

const deriveShortName = (name) => {
  const acronym = name.split(/\s+/).filter((word) => !["and", "of", "the"].includes(word.toLowerCase())).map((word) => word[0]).join("").toUpperCase();
  return acronym.length >= 2 && acronym.length <= 10 ? acronym : undefined;
};

const confirmImport = async (id) => {
  const session = await findActiveSession(id);
  if (session.status !== IMPORT_STATUSES.PREVIEWED) throw new AppError("Import session has already been used", 409, "IMPORT_SESSION_ALREADY_USED");
  session.status = IMPORT_STATUSES.FAILED;
  await session.save();
  const eligible = session.normalizedRows.filter((row) => row.importable && row.action !== "SKIP" && row.errors.length === 0);
  const codes = eligible.map((row) => row.code);
  const emails = eligible.filter((row) => EMAIL_PATTERN.test(row.officialEmail || "")).map((row) => row.officialEmail);
  const conflicts = await Society.find({ $or: [{ code: { $in: codes } }, { email: { $in: emails } }] }, { code: 1, email: 1 }).lean();
  const conflictCodes = new Set(conflicts.map((item) => item.code));
  const conflictEmails = new Set(conflicts.map((item) => item.email).filter(Boolean));
  const importRows = eligible.filter((row) => !conflictCodes.has(row.code) && !conflictEmails.has(row.officialEmail));
  const operations = importRows.map((row) => ({ insertOne: { document: {
    name: row.name, code: row.code, shortName: deriveShortName(row.name), category: row.category,
    ...(EMAIL_PATTERN.test(row.officialEmail || "") ? { email: row.officialEmail } : {}),
    academicSession: row.academicSession, status: row.status, isActive: row.isActive,
    metadata: { entityType: row.entityType, campus: row.campus, importSource: "SOCIETY_EXCEL", sourceRowNumber: row.rowNumber, presidentPreview: row.presidentPreview },
  } } }));

  const failures = [];
  let importedCount = 0;
  try {
    if (operations.length) {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      if (hello.setName || hello.msg === "isdbgrid") {
        await mongoose.connection.transaction(async (transaction) => {
          const result = await Society.bulkWrite(operations, { ordered: false, session: transaction });
          importedCount = result.insertedCount;
        });
      } else {
        try {
          const result = await Society.bulkWrite(operations, { ordered: false });
          importedCount = result.insertedCount;
        } catch (error) {
          importedCount = error.result?.insertedCount || 0;
          for (const item of error.writeErrors || []) failures.push({ rowNumber: importRows[item.index]?.rowNumber, code: item.code, message: item.errmsg });
        }
      }
    }
    session.status = IMPORT_STATUSES.IMPORTED;
    session.importedAt = new Date();
    await session.save();
    const previewSkipped = session.normalizedRows.filter((row) => row.action === "SKIP").length;
    return {
      importSessionId: session.id,
      importedCount,
      skippedCount: previewSkipped + eligible.length - importRows.length,
      failedCount: failures.length,
      failures,
    };
  } catch (error) {
    throw error;
  }
};

module.exports = { previewImport, getImportSession, confirmImport };
