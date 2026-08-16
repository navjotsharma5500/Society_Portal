const ExcelJS = require("exceljs");
const AppError = require("../../common/errors/AppError");
const Department = require("../departments/department.model");
const Role = require("../roles/role.model");
const Society = require("../societies/society.model");
const User = require("./user.model");
const Student = require("../studentMaster/studentMaster.model");
const Session = require("./userImportSession.model");
const users = require("./user.service");
const assignments = require("../userRoleAssignments/userRoleAssignment.service");
const identity = require("../identity/identityResolution.service");
const normalization = require("../identity/identityNormalization");
const { USER_STATUSES, ACCOUNT_TYPES } = require("./user.constants");

const headers = [
  "Full Name", "Email", "Contact", "Department Code", "Designation",
  "Role Code", "Society Code", "Profile Picture URL (Optional)",
  "Login Access", "Account Status",
];
const assignableRoleQuery = {
  status: "ACTIVE",
  isAssignable: true,
  code: { $ne: "SUPER_ADMIN" },
};
const activeSocietyQuery = { status: "ACTIVE", isActive: true };
const style = (row) => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF86172C" } };
};
const cellText = (row, column) => String(row.getCell(column).text || "").trim();

const template = async () => {
  const [departments, roles, societies] = await Promise.all([
    Department.find({ status: "ACTIVE" }).select("name code publicId status").sort({ sortOrder: 1, name: 1 }).lean(),
    Role.find(assignableRoleQuery).select("name code category scopeType isAssignable").sort({ rank: -1, name: 1 }).lean(),
    Society.find(activeSocietyQuery).select("name code status").sort({ name: 1 }).lean(),
  ]);
  const workbook = new ExcelJS.Workbook();
  const upload = workbook.addWorksheet("User Upload");
  upload.columns = headers.map((header, index) => ({
    header,
    width: [28, 32, 20, 22, 26, 22, 22, 40, 18, 22][index],
  }));
  style(upload.getRow(1));
  upload.views = [{ state: "frozen", ySplit: 1 }];
  upload.autoFilter = "A1:J1";
  upload.getCell("A2").note = "Use canonical codes from the reference sheets. Society Code is required for SOCIETY roles, optional for GLOBAL roles, and selects SOCIETY scope for BOTH roles.";

  const departmentSheet = workbook.addWorksheet("Department Reference");
  departmentSheet.columns = [
    { header: "Department Name", width: 36 }, { header: "Department Code", width: 22 },
    { header: "Public ID", width: 22 }, { header: "Status", width: 16 },
  ];
  departments.forEach((item) => departmentSheet.addRow([item.name, item.code, item.publicId || "", item.status]));
  style(departmentSheet.getRow(1));
  departmentSheet.views = [{ state: "frozen", ySplit: 1 }];
  departmentSheet.autoFilter = "A1:D1";

  const roleSheet = workbook.addWorksheet("Role Reference");
  roleSheet.columns = [
    { header: "Role Name", width: 34 }, { header: "Role Code", width: 26 },
    { header: "Role Type / Category", width: 24 }, { header: "Scope", width: 16 },
    { header: "Assignable", width: 14 },
  ];
  roles.forEach((item) => roleSheet.addRow([item.name, item.code, item.category, item.scopeType, item.isAssignable ? "Yes" : "No"]));
  style(roleSheet.getRow(1));
  roleSheet.views = [{ state: "frozen", ySplit: 1 }];
  roleSheet.autoFilter = "A1:E1";

  const societySheet = workbook.addWorksheet("Society Reference");
  societySheet.columns = [
    { header: "Society Name", width: 38 }, { header: "Society Code", width: 22 },
    { header: "Status", width: 16 },
  ];
  societies.forEach((item) => societySheet.addRow([item.name, item.code, item.status]));
  style(societySheet.getRow(1));
  societySheet.views = [{ state: "frozen", ySplit: 1 }];
  societySheet.autoFilter = "A1:C1";

  const allowed = workbook.addWorksheet("Allowed Values");
  allowed.addRows([
    ["Login Access", "Account Status"], ["Yes", "ACTIVE"], ["No", "INACTIVE"],
    [null, "PENDING_ONBOARDING"], [null, "PENDING_APPROVAL"],
  ]);
  style(allowed.getRow(1));
  if (departments.length) workbook.definedNames.add("DepartmentCodes", `'Department Reference'!$B$2:$B$${departments.length + 1}`);
  if (roles.length) workbook.definedNames.add("RoleCodes", `'Role Reference'!$B$2:$B$${roles.length + 1}`);
  if (societies.length) workbook.definedNames.add("SocietyCodes", `'Society Reference'!$B$2:$B$${societies.length + 1}`);
  workbook.definedNames.add("LoginAccessValues", "'Allowed Values'!$A$2:$A$3");
  workbook.definedNames.add("AccountStatusValues", "'Allowed Values'!$B$2:$B$5");
  for (let row = 2; row <= 10001; row += 1) {
    if (departments.length) upload.getCell(`D${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ["DepartmentCodes"] };
    if (roles.length) upload.getCell(`F${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ["RoleCodes"] };
    if (societies.length) upload.getCell(`G${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ["SocietyCodes"] };
    upload.getCell(`I${row}`).dataValidation = { type: "list", allowBlank: false, formulae: ["LoginAccessValues"] };
    upload.getCell(`J${row}`).dataValidation = { type: "list", allowBlank: false, formulae: ["AccountStatusValues"] };
  }
  return workbook.xlsx.writeBuffer();
};

const preview = async (file, actorId) => {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(file.buffer); } catch { throw new AppError("Unable to read the XLSX workbook", 400, "INVALID_EXCEL_FILE"); }
  const sheet = workbook.getWorksheet("User Upload");
  if (!sheet) throw new AppError("User Upload sheet is required", 400, "INVALID_EXCEL_FILE");
  const raw = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && row.values.some(Boolean)) raw.push({
      rowNumber,
      displayName: cellText(row, 1),
      email: normalization.normalizeEmail(cellText(row, 2)),
      contactNumber: cellText(row, 3),
      departmentCode: cellText(row, 4).toUpperCase(),
      designation: cellText(row, 5),
      roleCode: cellText(row, 6).toUpperCase(),
      societyCode: cellText(row, 7).toUpperCase(),
      profilePictureUrl: cellText(row, 8),
      isLoginAllowed: /^(yes|true|1)$/i.test(cellText(row, 9)),
      status: cellText(row, 10).toUpperCase(),
    });
  });
  const codes = (key) => [...new Set(raw.map((row) => row[key]).filter(Boolean))];
  const [departments, roles, societies, resolved, existingUsers] = await Promise.all([
    Department.find({ code: { $in: codes("departmentCode") }, status: "ACTIVE" }).lean(),
    Role.find({ code: { $in: codes("roleCode") } }).lean(),
    Society.find({ code: { $in: codes("societyCode") } }).lean(),
    identity.batchResolve(raw.map((row) => ({ email: row.email, contactNumber: row.contactNumber }))),
    User.find({ email: { $in: codes("email") } }).select("email accountType publicId").lean(),
  ]);
  const departmentMap = new Map(departments.map((item) => [item.code, item]));
  const roleMap = new Map(roles.map((item) => [item.code, item]));
  const societyMap = new Map(societies.map((item) => [item.code, item]));
  const userMap = new Map(existingUsers.map((item) => [item.email, item]));
  const seenAssignments = new Set();
  const rows = raw.map((row, index) => {
    const errors = [];
    const role = roleMap.get(row.roleCode);
    const society = societyMap.get(row.societyCode);
    const existingUser = userMap.get(row.email);
    const contact = normalization.normalizeContact(row.contactNumber);
    if (!row.displayName || !/^\S+@\S+\.\S+$/.test(row.email)) errors.push("INVALID_REQUIRED_FIELD");
    if (row.profilePictureUrl && !/^https?:\/\/\S+$/i.test(row.profilePictureUrl)) errors.push("INVALID_PROFILE_PICTURE_URL");
    if (row.departmentCode && !departmentMap.has(row.departmentCode)) errors.push("UNKNOWN_DEPARTMENT_CODE");
    if (row.roleCode) {
      if (!role) errors.push("UNKNOWN_ROLE_CODE");
      else {
        if (role.status !== "ACTIVE") errors.push("INACTIVE_ROLE");
        if (!role.isAssignable) errors.push("ROLE_NOT_ASSIGNABLE");
        if (role.code === "SUPER_ADMIN") errors.push("SYSTEM_ROLE_PROTECTED");
        if (role.scopeType === "SOCIETY" && !row.societyCode) errors.push("SOCIETY_CODE_REQUIRED");
      }
    }
    if (row.societyCode) {
      if (!society) errors.push("UNKNOWN_SOCIETY_CODE");
      else if (society.status !== "ACTIVE" || !society.isActive) errors.push("INACTIVE_SOCIETY");
      if (role?.scopeType === "GLOBAL") errors.push("SOCIETY_NOT_ALLOWED_FOR_GLOBAL_ROLE");
    }
    if (role && existingUser) {
      const student = existingUser.accountType === ACCOUNT_TYPES.STUDENT;
      if ((student && !role.isStudentRole) || (!student && role.isStudentRole && !role.isLeadershipRole)) errors.push("ROLE_ACCOUNT_TYPE_INCOMPATIBLE");
    }
    if (!Object.values(USER_STATUSES).includes(row.status)) errors.push("INVALID_ACCOUNT_STATUS");
    if (resolved[index].classification === "IDENTITY_CONFLICT") errors.push("IDENTITY_CONFLICT");
    const assignmentKey = `${row.email}|${row.roleCode}|${row.societyCode}`;
    if (seenAssignments.has(assignmentKey)) errors.push("DUPLICATE_ASSIGNMENT_IN_FILE");
    seenAssignments.add(assignmentKey);
    const scopeType = role?.scopeType === "BOTH" ? (row.societyCode ? "SOCIETY" : "GLOBAL") : role?.scopeType || null;
    return {
      ...row,
      normalizedContact: contact,
      departmentName: departmentMap.get(row.departmentCode)?.name || null,
      roleId: role?._id || null,
      roleName: role?.name || null,
      roleScope: role?.scopeType || null,
      assignmentScope: scopeType,
      societyId: society?._id || null,
      societyName: society?.name || null,
      existingUserPublicId: resolved[index].existing?.publicId || null,
      classification: errors.length ? (errors.includes("IDENTITY_CONFLICT") ? "IDENTITY_CONFLICT" : "INVALID") : (resolved[index].classification === "EXISTING" ? "EXISTING" : "VALID"),
      errors,
      importable: !errors.length,
    };
  });
  const summary = { totalRows: rows.length, validRows: rows.filter((row) => row.importable).length, invalidRows: rows.filter((row) => !row.importable).length };
  const session = await Session.create({ sourceFileName: file.originalname, rows, summary, createdBy: actorId, expiresAt: new Date(Date.now() + 1800000) });
  return { importSessionId: session.id, rows, summary };
};

const findExistingUser = async (row) => {
  let user = await User.findOne({ email: row.email });
  if (user || !row.existingUserPublicId) return user;
  const student = await Student.findOne({ publicId: row.existingUserPublicId }).select("_id").lean();
  return student ? User.findOne({ studentMasterId: student._id }) : null;
};

const confirm = async (id, actorId) => {
  const session = await Session.findOne({ _id: id, status: "PREVIEWED", expiresAt: { $gt: new Date() } });
  if (!session) throw new AppError("User import session not found or already used", 409, "IMPORT_SESSION_NOT_AVAILABLE");
  const importableRows = session.rows.filter((row) => row.importable);
  const rechecked = await identity.batchResolve(importableRows.map((row) => ({ email: row.email, contactNumber: row.contactNumber })));
  const results = [];
  const importedUsers = new Map();
  for (let index = 0; index < importableRows.length; index += 1) {
    const row = importableRows[index];
    if (rechecked[index].classification === "IDENTITY_CONFLICT") {
      results.push({ rowNumber: row.rowNumber, status: "SKIPPED", errors: ["IDENTITY_CONFLICT"] });
      continue;
    }
    try {
      let user = importedUsers.get(row.email) || await findExistingUser(row);
      let userStatus = "REUSED";
      if (!user) {
        user = await users.createUser({
          displayName: row.displayName,
          email: row.email,
          accountType: ACCOUNT_TYPES.STAFF,
          status: row.status,
          isLoginAllowed: row.isLoginAllowed,
          profilePictureUrl: row.profilePictureUrl || undefined,
          metadata: { contactNumber: row.contactNumber, department: row.departmentName, departmentCode: row.departmentCode, designation: row.designation },
        });
        userStatus = "CREATED";
      }
      importedUsers.set(row.email, user);
      if (row.roleId) await assignments.createAssignment({
        userId: user._id,
        roleId: row.roleId,
        scopeType: row.assignmentScope,
        societyId: row.assignmentScope === "SOCIETY" ? row.societyId : null,
        assignmentSource: "IMPORT",
        createdBy: actorId,
      });
      results.push({ rowNumber: row.rowNumber, userId: user.id, userStatus, status: "IMPORTED", errors: [] });
    } catch (error) {
      results.push({ rowNumber: row.rowNumber, status: "FAILED", errors: [error.code || "IMPORT_FAILED"] });
    }
  }
  session.status = "IMPORTED";
  session.importedAt = new Date();
  await session.save();
  return {
    importSessionId: session.id,
    summary: { created: results.filter((row) => row.userStatus === "CREATED").length, reused: results.filter((row) => row.userStatus === "REUSED").length, imported: results.filter((row) => row.status === "IMPORTED").length, failed: results.filter((row) => row.status !== "IMPORTED").length },
    results,
  };
};

module.exports = { template, preview, confirm };
