const ExcelJS = require("exceljs");
const AppError = require("../../common/errors/AppError");
const Society = require("../societies/society.model");
const societyService = require("../societies/society.service");
const { prepareSocietyCode, isValidSocietyCode } = require("../societies/societyCode.service");
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
const normalizeEntityType = (value) => {
  const key = normalizeKey(value);
  const mappings = {
    society: ENTITY_TYPES.SOCIETY,
    societies: ENTITY_TYPES.SOCIETY,
    club: ENTITY_TYPES.CLUB,
    clubs: ENTITY_TYPES.CLUB,
    "student chapter": ENTITY_TYPES.STUDENT_CHAPTER,
    chapter: ENTITY_TYPES.STUDENT_CHAPTER,
    cell: ENTITY_TYPES.CELL,
    cells: ENTITY_TYPES.CELL,
  };
  return mappings[key] || null;
};

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
  const hasIdentityColumn = ["code", "officialEmail", "presidentEmail"].some(
    (field) => headers[field] !== undefined
  );
  return headers.name !== undefined && hasIdentityColumn ? headers : null;
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
    const entityType = normalizeEntityType(at("entityType")) || section?.entityType || null;
    const campus = cleanText(at("campus"))?.toUpperCase().replace(/[\s-]+/g, "_") || section?.campus || null;
    const president = parsePresident(at("president"), at("presidentDesignation"));
    president.email = cleanEmail(at("presidentEmail"));
    rawRows.push({
      rowNumber, name, suppliedCode: cleanText(at("code")), officialEmail: cleanEmail(at("officialEmail")),
      entityType, campus, suppliedCategory: cleanText(at("category")), presidentPreview: president,
      legacyLeadershipColumnsPresent: headers.president !== undefined || headers.presidentEmail !== undefined || headers.presidentDesignation !== undefined,
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
  const uploadNames = new Set();
  const uploadEmails = new Set();
  const uploadSuppliedCodes = new Set();
  const rows = [];

  for (const raw of rawRows) {
    const warnings = [];
    const errors = [];
    if (!raw.name) errors.push("SOCIETY_NAME_MISSING");
    if (!raw.sectionRecognized || !Object.values(ENTITY_TYPES).includes(raw.entityType) || !Object.values(CAMPUSES).includes(raw.campus)) errors.push("SECTION_NOT_RECOGNIZED");
    const category = raw.suppliedCategory || CATEGORY_BY_ENTITY_TYPE[raw.entityType] || null;
    const suppliedWasValid = isValidSocietyCode(raw.suppliedCode);
    const preparedCode = await prepareSocietyCode({
      suppliedCode: raw.suppliedCode,
      name: raw.name,
      campus: raw.campus,
      usedCodes,
    });
    const code = preparedCode.code;
    if (!code) errors.push("CODE_GENERATION_FAILED");
    if (raw.suppliedCode && !suppliedWasValid) warnings.push("INVALID_CODE_REGENERATED");
    if (!raw.officialEmail) warnings.push("SOCIETY_EMAIL_MISSING");
    else if (!EMAIL_PATTERN.test(raw.officialEmail)) warnings.push("SOCIETY_EMAIL_INVALID");
    if (raw.legacyLeadershipColumnsPresent) warnings.push("DEPRECATED_LEADERSHIP_COLUMNS_IGNORED");
    if (![raw.name, code, raw.entityType, raw.campus, category].every(Boolean)) errors.push("REQUIRED_FIELD_MISSING");

    const nameCampusKey = `${normalizeName(raw.name)}|${raw.campus}`;
    const emailCampusKey = raw.officialEmail ? `${raw.officialEmail}|${raw.campus}` : null;
    const normalizedSuppliedCode = suppliedWasValid ? raw.suppliedCode.trim().toUpperCase() : null;
    const existingMatch = existing.some((item) =>
      (normalizedSuppliedCode && item.code === normalizedSuppliedCode) ||
      (normalizeName(item.name) === normalizeName(raw.name) && item.metadata?.campus === raw.campus)
      || (raw.officialEmail && item.email === raw.officialEmail && item.metadata?.campus === raw.campus)
    );
    let action = "IMPORT";
    if (existingMatch) { warnings.push("SOCIETY_ALREADY_EXISTS"); action = "SKIP"; }
    else if (
      uploadNames.has(nameCampusKey) ||
      (emailCampusKey && uploadEmails.has(emailCampusKey)) ||
      (normalizedSuppliedCode && uploadSuppliedCodes.has(normalizedSuppliedCode))
    ) { warnings.push("DUPLICATE_IN_UPLOAD"); action = "SKIP"; }
    uploadNames.add(nameCampusKey);
    if (emailCampusKey) uploadEmails.add(emailCampusKey);
    if (normalizedSuppliedCode) uploadSuppliedCodes.add(normalizedSuppliedCode);
    if (code) usedCodes.add(code);
    const importable = errors.length === 0 && action !== "SKIP";
    rows.push({
      rowNumber: raw.rowNumber, name: raw.name, code, officialEmail: raw.officialEmail,
      entityType: raw.entityType, campus: raw.campus, category,
      academicSession: raw.academicSession,
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
  const data = {
    importSessionId: session.id,
    status: session.status,
    summary: summarize(session.normalizedRows),
    rows: session.normalizedRows,
  };
  if (session.status === IMPORT_STATUSES.IMPORTED) {
    data.importSummary = session.importSummary;
    data.importResults = session.importResults;
  }
  return data;
};

const deriveShortName = (name) => {
  const acronym = name.split(/\s+/).filter((word) => !["and", "of", "the"].includes(word.toLowerCase())).map((word) => word[0]).join("").toUpperCase();
  return acronym.length >= 2 && acronym.length <= 10 ? acronym : undefined;
};

const confirmImport = async (id) => {
  let session = await Session.findOneAndUpdate(
    { _id: id, expiresAt: { $gt: new Date() }, status: IMPORT_STATUSES.PREVIEWED },
    { $set: { status: IMPORT_STATUSES.FAILED } },
    { returnDocument: "after" }
  );
  if (!session) {
    session = await findActiveSession(id);
    throw new AppError("Import session has already been used", 409, "IMPORT_SESSION_ALREADY_USED");
  }

  const results = [];
  for (const row of session.normalizedRows) {
    const result = {
      rowNumber: row.rowNumber,
      societyName: row.name,
      societyCode: row.code,
      societyId: null,
      societyStatus: "SKIPPED",
      leadershipStatus: "SKIPPED",
      leadershipReason: "SOCIETY_NOT_CREATED",
      errors: [...(row.errors || [])],
    };

    if (!row.importable || row.action === "SKIP" || row.errors.length > 0) {
      if (row.action === "SKIP") result.errors.push("SOCIETY_ALREADY_EXISTS_OR_DUPLICATE");
      results.push(result);
      continue;
    }

    const preparedCode = await prepareSocietyCode({
      suppliedCode: row.code,
      name: row.name,
      campus: row.campus,
      isCodeTaken: async (code) => Boolean(await Society.exists({ code })),
    });
    row.code = preparedCode.code;
    const conflict = await Society.findOne({
      $or: [
        { code: row.code },
        ...(EMAIL_PATTERN.test(row.officialEmail || "") ? [{ email: row.officialEmail, "metadata.campus": row.campus }] : []),
        { name: row.name, "metadata.campus": row.campus },
      ],
    }).lean();
    if (conflict) {
      result.errors.push("SOCIETY_ALREADY_EXISTS");
      results.push(result);
      continue;
    }

    try {
      const society = await societyService.createSociety({
        name: row.name,
        code: row.code,
        shortName: deriveShortName(row.name),
        category: row.category,
        ...(EMAIL_PATTERN.test(row.officialEmail || "") ? { email: row.officialEmail } : {}),
        academicSession: row.academicSession,
        status: row.status,
        isActive: row.isActive,
        metadata: {
          entityType: row.entityType,
          campus: row.campus,
          importSource: "SOCIETY_EXCEL",
          sourceRowNumber: row.rowNumber,
        },
      }, { skipCacheInvalidation: true });
      result.societyId = society.id;
      result.societyStatus = "CREATED";
      result.leadershipStatus = "NOT_APPLICABLE";
      result.leadershipReason = "ASSIGN_TEAM_THROUGH_CANONICAL_ROLE_WORKFLOW";
    } catch (error) {
      if (error.code === "SOCIETY_CODE_EXISTS" || error.code === 11000) {
        result.societyStatus = "SKIPPED";
        result.errors.push("SOCIETY_ALREADY_EXISTS");
      } else {
        result.societyStatus = "FAILED";
        result.errors.push(error.code || error.message || "SOCIETY_CREATION_FAILED");
      }
    }
    results.push(result);
  }

  const count = (field, status) => results.filter((result) => result[field] === status).length;
  const summary = {
    societiesCreated: count("societyStatus", "CREATED"),
    societiesSkipped: count("societyStatus", "SKIPPED"),
    societiesFailed: count("societyStatus", "FAILED"),
    leadershipCreated: count("leadershipStatus", "CREATED"),
    leadershipSkipped: count("leadershipStatus", "SKIPPED"),
    leadershipDuplicates: count("leadershipStatus", "DUPLICATE"),
    leadershipFailed: count("leadershipStatus", "FAILED"),
  };
  const importableRows = session.normalizedRows.filter((row) => row.importable && row.action !== "SKIP" && row.errors.length === 0).length;
  if (importableRows > 0 && summary.societiesCreated === 0 && summary.societiesSkipped < importableRows) {
    throw new AppError(
      "No importable society rows could be processed",
      500,
      "IMPORT_CONFIRMATION_NO_ROWS_PROCESSED"
    );
  }
  session.status = IMPORT_STATUSES.IMPORTED;
  session.importedAt = new Date();
  session.importSummary = summary;
  session.importResults = results;
  await session.save();
  await require("../../cache/cacheInvalidation").societies();
  return { importSessionId: session.id, summary, results };
};

module.exports = { previewImport, getImportSession, confirmImport };
