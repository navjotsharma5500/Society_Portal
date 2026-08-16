const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const { gzipSync, gunzipSync } = require("node:zlib");
const AppError = require("../../common/errors/AppError");
const Student = require("./studentMaster.model");
const Society = require("../societies/society.model");
const Session = require("./models/studentImportSession.model");
const studentService = require("./studentMaster.service");
const User = require("../users/user.model");
const { reservePublicIds } = require("../publicIds/publicId.service");
const { IMPORT_STATUSES, EMAIL_PATTERN } = require("./studentMaster.constants");
const { studentColumns, header } = require("./studentMasterTemplate.service");
const clean = (v) => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (v.text) v = v.text;
    else if (v.result !== undefined) v = v.result;
    else if (Array.isArray(v.richText))
      v = v.richText.map((x) => x.text).join("");
  }
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
};
const email = (v) => clean(v)?.replace(/\s/g, "").toLowerCase() || null;
const key = (v) =>
  (clean(v) || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const bool = (v) => {
  const k = key(v);
  return ["true", "yes", "1", "current", "active"].includes(k)
    ? true
    : ["false", "no", "0"].includes(k)
      ? false
      : null;
};
const date = (v) => {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime()))
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const text = clean(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text || "")) return null;
  const d = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text
    ? null
    : d;
};
const aliases = {
  name: "name",
  email: "email",
  contactNumber: "contact number",
  rollNumber: "roll number",
  course: "course",
  branch: "branch",
  year: "year",
  cgpa: "cgpa",
  dateOfBirth: "date of birth",
  bloodGroup: "blood group",
  hostel: "hostel",
  roomType: "room type",
  roomNumber: "room number",
  fatherName: "father name",
  fatherEmail: "father email",
  fatherContact: "father contact",
  motherName: "mother name",
  motherEmail: "mother email",
  motherContact: "mother contact",
  line1: "address line 1",
  line2: "address line 2",
  city: "city",
  state: "state",
  postalCode: "postal code",
  country: "country",
  isLoginAllowed: "login allowed",
  recordStatus: "record status",
  profilePictureUrl: "profile picture url optional",
};
const mapHeaders = (sheet) => {
  const m = {};
  sheet.getRow(1).eachCell((c, i) => {
    const k = key(c.value).replace(/\s*\*$/g, "");
    for (const [f, h] of Object.entries(aliases)) if (k === h) m[f] = i;
  });
  return m;
};
const val = (row, map, f) => (map[f] ? row.getCell(map[f]).value : null);
const parse = async (buffer, defaultSession) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet("Students");
  if (!sheet)
    throw new AppError(
      "Students sheet is required",
      400,
      "INVALID_STUDENT_IMPORT_FILE",
    );
  const map = mapHeaders(sheet),
    raw = [];
  if (!map.name || !map.email || !map.contactNumber)
    throw new AppError(
      "Students sheet must contain Name, Email and Contact Number columns",
      400,
      "INVALID_STUDENT_IMPORT_FILE",
    );
  sheet.eachRow((r, n) => {
    if (n === 1) return;
    const name = clean(val(r, map, "name")),
      mail = email(val(r, map, "email")),
      contact = clean(val(r, map, "contactNumber"));
    if (!name && !mail && !contact) return;
    const cgRaw = clean(val(r, map, "cgpa")),
      dobRaw = val(r, map, "dateOfBirth");
    raw.push({
      rowNumber: n,
      name,
      email: mail,
      contactNumber: contact,
      rollNumber: clean(val(r, map, "rollNumber"))?.toUpperCase() || null,
      course: clean(val(r, map, "course")),
      branch: clean(val(r, map, "branch")),
      year: clean(val(r, map, "year")),
      cgpa: cgRaw === null ? null : Number(cgRaw),
      dateOfBirth: date(dobRaw),
      invalidDate: Boolean(dobRaw && !date(dobRaw)),
      bloodGroup: clean(val(r, map, "bloodGroup")),
      hostel: clean(val(r, map, "hostel")),
      roomType: clean(val(r, map, "roomType")),
      roomNumber: clean(val(r, map, "roomNumber")),
      fatherName: clean(val(r, map, "fatherName")),
      fatherEmail: email(val(r, map, "fatherEmail")),
      fatherContact: clean(val(r, map, "fatherContact")),
      motherName: clean(val(r, map, "motherName")),
      motherEmail: email(val(r, map, "motherEmail")),
      motherContact: clean(val(r, map, "motherContact")),
      permanentAddress: {
        line1: clean(val(r, map, "line1")),
        line2: clean(val(r, map, "line2")),
        city: clean(val(r, map, "city")),
        state: clean(val(r, map, "state")),
        postalCode: clean(val(r, map, "postalCode")),
        country: clean(val(r, map, "country")),
      },
      isLoginAllowed: bool(val(r, map, "isLoginAllowed")) ?? true,
      recordStatus:
        clean(val(r, map, "recordStatus"))?.toUpperCase() || "ACTIVE",
      profilePictureUrl: clean(val(r, map, "profilePictureUrl")),
      defaultSession,
    });
  });
  const refsByEmail = new Map();
  const refSheet = wb.getWorksheet("Society References");
  if (refSheet) {
    const headers = {};
    refSheet
      .getRow(1)
      .eachCell((c, i) => (headers[key(c.value).replace(/\s*\*$/g, "")] = i));
    const at = (r, k) => (headers[k] ? r.getCell(headers[k]).value : null);
    for (let n = 2; n <= refSheet.rowCount; n++) {
      const r = refSheet.getRow(n),
        mail = email(at(r, "student email"));
      if (!mail) continue;
      const code = clean(at(r, "society code"))?.toUpperCase() || null,
        name = clean(at(r, "society name"));
      let society = code ? await Society.findOne({ code }).lean() : null;
      if (!society && name)
        society = await Society.findOne({
          name: new RegExp(
            `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
        }).lean();
      const ref = {
        societyId: society?._id || null,
        societyCode: code || society?.code || null,
        societyName: name || society?.name || null,
        importedRoleCode: clean(at(r, "imported role code")),
        importedRoleName: clean(at(r, "imported role name")),
        isCurrent: bool(at(r, "current role reference")) ?? false,
        academicSession:
          clean(at(r, "academic session")) || defaultSession || null,
        metadata: society ? {} : { unresolved: true },
      };
      if (!refsByEmail.has(mail)) refsByEmail.set(mail, []);
      refsByEmail.get(mail).push(ref);
    }
  }
  for (const row of raw)
    row.societyReferences = refsByEmail.get(row.email) || [];
  return raw;
};
const validate = async (raw) => {
  const normalization = require("../identity/identityNormalization"), resolutions = await require("../identity/identityResolution.service").batchResolve(raw),
    seenEmails = new Set(),
    seenRolls = new Set(), seenContacts = new Set();
  return resolutions.map(({ row: r, classification, existing }) => {
    const warnings = [],
      errors = [];
    if (!r.name || !r.email || !r.contactNumber)
      errors.push("MANDATORY_FIELD_MISSING");
    if (r.email && !EMAIL_PATTERN.test(r.email)) errors.push("INVALID_EMAIL");
    if (
      r.cgpa != null &&
      (!Number.isFinite(r.cgpa) || r.cgpa < 0 || r.cgpa > 10)
    )
      errors.push("INVALID_CGPA");
    if (r.invalidDate) errors.push("INVALID_DATE");
    if (r.profilePictureUrl && !/^https?:\/\/\S+$/i.test(r.profilePictureUrl)) errors.push("INVALID_PROFILE_PICTURE_URL");
    if ((r.societyReferences || []).some((x) => x.metadata.unresolved))
      warnings.push("SOCIETY_REFERENCE_NOT_FOUND");
    let action = "IMPORT";
    if (classification === "EXISTING") { warnings.push("STUDENT_ALREADY_EXISTS"); action = "SKIP"; }
    if (classification === "IDENTITY_CONFLICT") { errors.push("IDENTITY_CONFLICT"); action = "SKIP"; }
    if (seenEmails.has(r.email)) {
      errors.push("DUPLICATE_EMAIL_IN_UPLOAD");
      action = "SKIP";
    }
    if (r.rollNumber && seenRolls.has(r.rollNumber)) {
      errors.push("DUPLICATE_ROLL_NUMBER_IN_UPLOAD");
      action = "SKIP";
    }
    if (r.normalizedContact && seenContacts.has(r.normalizedContact)) { errors.push("DUPLICATE_CONTACT_IN_UPLOAD"); action = "SKIP"; }
    if (r.email) seenEmails.add(r.email);
    if (r.rollNumber) seenRolls.add(r.rollNumber);
    if (r.normalizedContact) seenContacts.add(r.normalizedContact);
    return {
      ...r,
      classification: errors.length ? (errors.some((x) => x === "IDENTITY_CONFLICT") ? "IDENTITY_CONFLICT" : errors.some((x) => x.startsWith("DUPLICATE_")) ? "DUPLICATE_IN_FILE" : "INVALID") : classification,
      existingReference: existing,
      warnings,
      errors,
      action,
      importable: errors.length === 0 && action !== "SKIP",
    };
  });
};
const summary = (rows) => ({
  totalRows: rows.length,
  validRows: rows.filter((r) => r.importable && !r.warnings.length).length,
  warningRows: rows.filter((r) => r.warnings.length).length,
  invalidRows: rows.filter((r) => r.errors.length).length,
  skippedRows: rows.filter((r) => r.action === "SKIP").length,
  existingRows: rows.filter((r) => r.classification === "EXISTING").length,
  conflictRows: rows.filter((r) => r.classification === "IDENTITY_CONFLICT").length,
});
const pack = (value) => gzipSync(Buffer.from(JSON.stringify(value)));
const unpack = (value, fallback = []) => value ? JSON.parse(gunzipSync(value).toString("utf8")) : fallback;
const sessionRows = (session) => session.normalizedRowsGzip?.length ? unpack(session.normalizedRowsGzip) : session.normalizedRows;
const previewImport = async (file, academicSession) => {
  let raw;
  try {
    raw = await parse(file.buffer, academicSession);
  } catch (e) {
    if (e.isOperational) throw e;
    throw new AppError(
      "Unable to read student workbook",
      400,
      "INVALID_STUDENT_IMPORT_FILE",
    );
  }
  const rows = await validate(raw),
    sum = summary(rows),
    session = await Session.create({
      status: IMPORT_STATUSES.PREVIEWED,
      sourceFileName: file.originalname,
      ...sum,
      normalizedRowsGzip: pack(rows),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
  return { importSessionId: session.id, summary: sum, rows };
};
const findSession = async (id) => {
  const s = await Session.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  if (!s)
    throw new AppError(
      "Student import session not found",
      404,
      "STUDENT_IMPORT_SESSION_NOT_FOUND",
    );
  return s;
};
const getImportSession = async (id) => {
  const s = await findSession(id);
  return {
    importSessionId: s.id,
    status: s.status,
    summary: summary(sessionRows(s)),
    rows: sessionRows(s),
    importSummary: s.importSummary,
    importResults: s.importResultsGzip?.length ? unpack(s.importResultsGzip) : s.importResults,
  };
};
const confirmImport = async (id) => {
  let s = await Session.findOneAndUpdate(
    {
      _id: id,
      expiresAt: { $gt: new Date() },
      status: IMPORT_STATUSES.PREVIEWED,
    },
    { $set: { status: IMPORT_STATUSES.FAILED } },
    { returnDocument: "after" },
  );
  if (!s) {
    await findSession(id);
    throw new AppError(
      "Student import session has already been used",
      409,
      "STUDENT_IMPORT_SESSION_ALREADY_USED",
    );
  }
  const revalidatedRows = await validate(sessionRows(s).map((row) => row.toObject ? row.toObject() : row));
  const results = [];
  const accepted = revalidatedRows.filter((r) => r.importable && r.action !== "SKIP");
  const [studentPublicIds, userPublicIds] = await Promise.all([reservePublicIds("STUDENT", accepted.length), reservePublicIds("USER", accepted.length)]);
  const studentDocs = [], userDocs = [], acceptedByEmail = new Map();
  for (let index = 0; index < accepted.length; index += 1) {
    const r = accepted[index], studentId = new mongoose.Types.ObjectId();
    studentDocs.push({ _id: studentId, publicId: studentPublicIds[index], name:r.name,email:r.email,contactNumber:r.contactNumber,normalizedContact:r.normalizedContact,rollNumber:r.rollNumber,course:r.course,branch:r.branch,year:r.year,cgpa:r.cgpa,dateOfBirth:r.dateOfBirth,bloodGroup:r.bloodGroup,hostel:r.hostel,roomType:r.roomType,roomNumber:r.roomNumber,fatherName:r.fatherName,fatherEmail:r.fatherEmail,fatherContact:r.fatherContact,motherName:r.motherName,motherEmail:r.motherEmail,motherContact:r.motherContact,permanentAddress:r.permanentAddress,importedSocietyReferences:r.societyReferences,isLoginAllowed:r.isLoginAllowed,recordStatus:r.recordStatus,profilePictureUrl:r.profilePictureUrl,metadata:{importSource:"STUDENT_MASTER_EXCEL",sourceRowNumber:r.rowNumber} });
    userDocs.push({ publicId:userPublicIds[index],email:r.email,displayName:r.name,accountType:"STUDENT",status:"PENDING_ONBOARDING",studentMasterId:studentId,isLoginAllowed:r.isLoginAllowed });
    acceptedByEmail.set(r.email, { studentId, userId: null });
  }
  const bulkInsert = async (Model, docs) => { const failed = new Map(); if (!docs.length) return failed; for (let offset=0; offset<docs.length; offset+=1000) { const chunk=docs.slice(offset,offset+1000); try { await Model.insertMany(chunk,{ordered:false}); } catch(error) { for (const item of error.writeErrors||[]) failed.set(chunk[item.index]?.email, item.err?.code||error.code||"IMPORT_FAILED"); if (!(error.writeErrors||[]).length) throw error; } } return failed; };
  const studentFailures = await bulkInsert(Student, studentDocs);
  const viableUsers = userDocs.filter((doc) => !studentFailures.has(doc.email));
  const userFailures = await bulkInsert(User, viableUsers);
  if (userFailures.size) await Student.updateMany({ email:{ $in:[...userFailures.keys()] }, "metadata.importSource":"STUDENT_MASTER_EXCEL" }, { $set:{recordStatus:"INACTIVE",isLoginAllowed:false,"metadata.userCreationFailed":true} });
  for (const r of revalidatedRows) {
    const out = {
      rowNumber: r.rowNumber,
      email: r.email,
      studentStatus: "SKIPPED",
      userStatus: "SKIPPED",
      errors: [...(r.errors || [])],
    };
    if (!r.importable || r.action === "SKIP") {
      results.push(out);
      continue;
    }
    try {
      const failure = studentFailures.get(r.email) || userFailures.get(r.email);
      if (failure) throw Object.assign(new Error("Bulk import failed"), { code: failure });
      const linked = acceptedByEmail.get(r.email);
      const student = { id: linked.studentId }, user = viableUsers.find((item)=>item.email===r.email);
      /* Values were revalidated and inserted in bounded unordered batches above. */
      if (!linked || !user) throw Object.assign(new Error("Bulk import failed"), { code: "IMPORT_FAILED" });
      out.studentId = student.id;
      out.userId = String(user._id);
      out.studentStatus = "CREATED";
      out.userStatus = "CREATED";
    } catch (e) {
      out.studentStatus = [
        "USER_ALREADY_EXISTS",
        "IDENTITY_CONFLICT",
        "STUDENT_EMAIL_EXISTS",
        "STUDENT_ROLL_NUMBER_EXISTS",
        "USER_EMAIL_EXISTS",
      ].includes(e.code)
        ? "SKIPPED"
        : "FAILED";
      out.userStatus = out.studentStatus;
      out.errors.push(e.code || "IMPORT_FAILED");
    }
    results.push(out);
  }
  const count = (f, v) => results.filter((x) => x[f] === v).length;
  const sum = {
    studentsCreated: count("studentStatus", "CREATED"),
    studentsSkipped: count("studentStatus", "SKIPPED"),
    studentsFailed: count("studentStatus", "FAILED"),
    usersCreated: count("userStatus", "CREATED"),
    usersSkipped: count("userStatus", "SKIPPED"),
    usersFailed: count("userStatus", "FAILED"),
  };
  s.status = IMPORT_STATUSES.IMPORTED;
  s.importedAt = new Date();
  s.importSummary = sum;
  s.importResults = [];
  s.importResultsGzip = pack(results);
  await s.save();
  return { importSessionId: s.id, summary: sum, results };
};
const exportStudents = async (filters) => {
  const items = await studentService.listAllStudents(filters);
  const wb = new ExcelJS.Workbook(),
    students = wb.addWorksheet("Students", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
  students.columns = studentColumns.map(([header, width]) => ({
    header,
    width,
  }));
  header(students);
  const refs = wb.addWorksheet("Society References", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  refs.columns = [
    ["Student Email", 30],
    ["Society Code", 18],
    ["Society Name", 30],
    ["Imported Role Code", 22],
    ["Imported Role Name", 24],
    ["Current Role Reference", 22],
    ["Academic Session", 20],
  ].map(([header, width]) => ({ header, width }));
  header(refs);
  for (const s of items) {
    students.addRow([
      s.name,
      s.email,
      s.contactNumber,
      s.rollNumber,
      s.course,
      s.branch,
      s.year,
      s.cgpa,
      s.dateOfBirth,
      s.bloodGroup,
      s.hostel,
      s.roomType,
      s.roomNumber,
      s.fatherName,
      s.fatherEmail,
      s.fatherContact,
      s.motherName,
      s.motherEmail,
      s.motherContact,
      s.permanentAddress?.line1,
      s.permanentAddress?.line2,
      s.permanentAddress?.city,
      s.permanentAddress?.state,
      s.permanentAddress?.postalCode,
      s.permanentAddress?.country,
      s.isLoginAllowed,
      s.recordStatus,
      s.profilePictureUrl,
    ]);
    for (const r of s.importedSocietyReferences || [])
      refs.addRow([
        s.email,
        r.societyCode,
        r.societyName,
        r.importedRoleCode,
        r.importedRoleName,
        r.isCurrent,
        r.academicSession,
      ]);
  }
  return wb.xlsx.writeBuffer();
};
module.exports = {
  validate,
  previewImport,
  getImportSession,
  confirmImport,
  exportStudents,
};
