const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const database = require("../src/config/database");
const imports = require("../src/modules/users/userImport.service");
const Role = require("../src/modules/roles/role.model");
const Society = require("../src/modules/societies/society.model");
const User = require("../src/modules/users/user.model");
const Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model");
const Session = require("../src/modules/users/userImportSession.model");

const stamp = Date.now();
const emails = [`verify-import-${stamp}-a@example.com`, `verify-import-${stamp}-b@example.com`];
const sessionIds = [];
const previewRows = async (rows) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("User Upload");
  sheet.addRow(["Full Name","Email","Contact","Department Code","Designation","Role Code","Society Code","Profile Picture URL (Optional)","Login Access","Account Status"]);
  rows.forEach((row) => sheet.addRow(row));
  const result = await imports.preview({ buffer: await workbook.xlsx.writeBuffer(), originalname: "verify.xlsx" }, null);
  sessionIds.push(result.importSessionId);
  return result;
};

(async () => {
  await database.connectDatabase();
  const societies = await Society.find({ status: "ACTIVE", isActive: true }).limit(2).lean();
  assert.equal(societies.length, 2, "Two active societies are required for verification");
  const custom = await Role.create({ name: `Import Custom ${stamp}`, code: `IMPORT_CUSTOM_${stamp}`, category: "CUSTOM", scopeType: "SOCIETY", isAssignable: true, isStudentRole: false, isLeadershipRole: true, status: "ACTIVE" });
  const existing = await User.create({ displayName: "Existing Import User", email: emails[0], accountType: "STAFF", status: "ACTIVE", isLoginAllowed: true });
  try {
    const buffer = await imports.template();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const roleCodes = workbook.getWorksheet("Role Reference").getColumn(2).values;
    const societyCodes = workbook.getWorksheet("Society Reference").getColumn(2).values;
    for (const code of ["GENERAL_SECRETARY", "PRESIDENT", "VICE_PRESIDENT", custom.code]) assert(roleCodes.includes(code), `${code} missing from Role Reference`);
    assert(societyCodes.includes(societies[0].code), "Active society missing from Society Reference");
    const upload = workbook.getWorksheet("User Upload");
    for (const cell of ["D10001", "F10001", "G10001"]) assert(upload.getCell(cell).dataValidation.formulae?.length, `${cell} dropdown missing`);

    const before = { users: await User.countDocuments(), assignments: await Assignment.countDocuments() };
    const global = await previewRows([["Global User",emails[1],"","","Assistant","ASSISTANT","","","Yes","ACTIVE"]]);
    assert.equal(global.rows[0].importable, true, "GLOBAL role with blank society should pass");
    const validSociety = await previewRows([["Existing Import User",emails[0],"","","General Secretary","GENERAL_SECRETARY",societies[0].code,"","Yes","ACTIVE"]]);
    assert.equal(validSociety.rows[0].importable, true, "SOCIETY role with valid society should pass");
    assert.equal(validSociety.rows[0].classification, "EXISTING", "Existing user should be resolved for reuse");
    const missingSociety = await previewRows([["Missing Society",`missing-${stamp}@example.com`,"","","General Secretary","GENERAL_SECRETARY","","","Yes","ACTIVE"]]);
    assert(missingSociety.rows[0].errors.includes("SOCIETY_CODE_REQUIRED"));
    const unknownSociety = await previewRows([["Unknown Society",`unknown-${stamp}@example.com`,"","","General Secretary","GENERAL_SECRETARY","NOTREAL","","Yes","ACTIVE"]]);
    assert(unknownSociety.rows[0].errors.includes("UNKNOWN_SOCIETY_CODE"));
    assert.deepEqual({ users: await User.countDocuments(), assignments: await Assignment.countDocuments() }, before, "Preview must be write-free");

    const bulk = await previewRows([
      ["Existing Import User",emails[0],"","","General Secretary","GENERAL_SECRETARY",societies[0].code,"","Yes","ACTIVE"],
      ["New Import User",emails[1],"","","General Secretary","GENERAL_SECRETARY",societies[1].code,"","Yes","ACTIVE"],
    ]);
    const result = await imports.confirm(bulk.importSessionId, null);
    assert.equal(result.summary.imported, 2, "Both society assignments should import");
    assert.equal(await User.countDocuments({ email: emails[0] }), 1, "Existing user must not be duplicated");
    const assigned = await Assignment.find({ userId: { $in: [existing._id, (await User.findOne({email:emails[1]}))._id] }, roleId: (await Role.findOne({code:"GENERAL_SECRETARY"}))._id, scopeType: "SOCIETY" }).lean();
    assert.equal(assigned.length, 2, "General Secretary assignments should be society-scoped");
    console.log(JSON.stringify({ passed: true, roleReferenceCount: roleCodes.slice(2).filter(Boolean).length, societyReferenceCount: societyCodes.slice(2).filter(Boolean).length, dropdownRow10001: true, globalBlankSociety: true, societyValid: true, societyBlankRejected: true, unknownSocietyRejected: true, previewWriteFree: true, existingUserReused: true, bulkSocietyAssignments: true }, null, 2));
  } finally {
    const imported = await User.find({ email: { $in: emails } }).select("_id").lean();
    await Assignment.deleteMany({ userId: { $in: imported.map((user) => user._id) } });
    await User.deleteMany({ email: { $in: emails } });
    await Role.deleteOne({ _id: custom._id });
    await Session.deleteMany({ _id: { $in: sessionIds } });
  }
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
