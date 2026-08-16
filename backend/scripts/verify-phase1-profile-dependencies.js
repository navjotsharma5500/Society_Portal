const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const AcademicSession = require("../src/modules/academicSessions/academicSession.model");
const Department = require("../src/modules/departments/department.model");
const Building = require("../src/modules/infrastructure/building.model");
const Venue = require("../src/modules/infrastructure/venue.model");
const Society = require("../src/modules/societies/society.model");
const Student = require("../src/modules/studentMaster/studentMaster.model");
const User = require("../src/modules/users/user.model");
const Budget = require("../src/modules/societyBudgets/societyBudget.model");
const Transaction = require("../src/modules/societyBudgets/societyBudgetTransaction.model");
const StudentImport = require("../src/modules/studentMaster/models/studentImportSession.model");
const SocietyImport = require("../src/modules/societyImports/models/societyImportSession.model");
const MasterImport = require("../src/modules/masterImports/masterImportSession.model");
const studentImports = require("../src/modules/studentMaster/studentMasterImport.service");
const societyImports = require("../src/modules/societyImports/societyImport.service");
const masterImports = require("../src/modules/masterImports/masterImport.service");
const budgets = require("../src/modules/societyBudgets/societyBudget.service");
const infrastructure = require("../src/modules/infrastructure/infrastructure.service");
const profile = require("../src/modules/profile/profile.service");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const workbook = async (name, headers, row) => { const wb = new ExcelJS.Workbook(), sheet = wb.addWorksheet(name); sheet.addRow(headers); sheet.addRow(row); return Buffer.from(await wb.xlsx.writeBuffer()); };

(async () => {
  const tag = Date.now().toString().slice(-8), made = { sessions: [], departments: [], buildings: [], venues: [], societies: [], students: [], users: [], budgets: [], studentImports: [], societyImports: [], masterImports: [] };
  let originalCurrent;
  try {
    await connectDatabase(); originalCurrent = await AcademicSession.findOne({ isCurrent: true }).select("_id").lean(); await AcademicSession.updateMany({ isCurrent: true }, { $set: { isCurrent: false } });
    const department = await Department.create({ name: `Phase Department ${tag}`, code: `PD${tag.slice(-5)}` }); made.departments.push(department._id);
    const building = await Building.create({ name: `Phase Building ${tag}`, code: `PB${tag.slice(-5)}`, status: "ACTIVE" }); made.buildings.push(building._id);

    const studentPreview = await studentImports.previewImport({ originalname: "student.xlsx", buffer: await workbook("Students", ["Name", "Email", "Contact Number", "Roll Number"], [`Phase Student ${tag}`, `phase-student-${tag}@example.test`, "9999999999", `R${tag}`]) }); made.studentImports.push(studentPreview.importSessionId); assert(studentPreview.summary.invalidRows === 0, "student import must not require a session");
    const societyPreview = await societyImports.previewImport({ originalname: "society.xlsx", buffer: await workbook("Societies", ["Society Name", "Code", "Entity Type", "Campus"], [`Phase Society ${tag}`, `PS${tag.slice(-5)}`, "Society", "Patiala"]) }); made.societyImports.push(societyPreview.importSessionId); assert(societyPreview.rows[0]?.importable && !societyPreview.rows[0].academicSession, "society import must not require a session");

    const society = await Society.create({ name: `Budget Society ${tag}`, code: `BS${tag.slice(-5)}`, category: "TEST", status: "ACTIVE", isActive: true }); made.societies.push(society._id);
    let budgetBlocked = false; try { await budgets.createAnnualBudget({ societyId: society._id, allocatedAmount: 100 }); } catch (error) { budgetBlocked = error.code === "CURRENT_ACADEMIC_SESSION_REQUIRED" && error.message === "Please create and activate an Academic Session first."; } assert(budgetBlocked, "budget must require a current session");
    const session = await AcademicSession.create({ name: `218${tag.slice(-1)}-${tag.slice(-2)}`, startDate: "2180-01-01", endDate: "2180-12-31", status: "ACTIVE", isCurrent: true }); made.sessions.push(session._id);
    const budget = await budgets.createAnnualBudget({ societyId: society._id, academicSessionId: session._id, allocatedAmount: 100 }); made.budgets.push(budget._id); assert(budget.academicSessionId.equals(session._id), "budget with current session failed");

    let venueBlocked = false; try { await infrastructure.createVenue({ name: "Missing Building Venue", code: `MV${tag.slice(-5)}`, buildingId: new mongoose.Types.ObjectId(), venueType: "HALL" }); } catch (error) { venueBlocked = error.code === "ACTIVE_BUILDING_REQUIRED"; } assert(venueBlocked, "venue must require an active building");
    const venue = await infrastructure.createVenue({ name: `Phase Venue ${tag}`, code: `PV${tag.slice(-5)}`, buildingId: building._id, venueType: "HALL" }); made.venues.push(venue._id);
    const venuePreview = await masterImports.preview("VENUE", { originalname: "venue.xlsx", buffer: await workbook("VENUE Import", ["Venue Code", "Venue Name", "Building Code", "Venue Type", "Capacity", "Booking Status", "Record Status", "Description"], [`UV${tag.slice(-5)}`, "Unknown Venue", "DOES_NOT_EXIST", "HALL", 20, "ENABLED", "ACTIVE", "test"]) }); made.masterImports.push(venuePreview.importSessionId); assert(venuePreview.rows[0].errors.includes("UNKNOWN_BUILDING_CODE"), "unknown building must be rejected");

    const staff = await User.create({ email: `phase-staff-${tag}@example.test`, displayName: "Phase Staff", accountType: "ADMIN", status: "ACTIVE", isLoginAllowed: true, metadata: { contactNumber: "9000000000", department: "Student Affairs" } }); made.users.push(staff._id);
    const student = await Student.create({ name: "Phase Profile Student", email: `phase-profile-student-${tag}@example.test`, contactNumber: "9111111111", rollNumber: `PR${tag}`, course: "BE", branch: "CSE", year: "2", recordStatus: "ACTIVE" }); made.students.push(student._id);
    const studentUser = await User.create({ email: student.email, displayName: student.name, accountType: "STUDENT", status: "ACTIVE", isLoginAllowed: true, studentMasterId: student._id }); made.users.push(studentUser._id);
    assert((await profile.getOwnProfile(staff._id)).user.contactNumber === "9000000000", "staff profile failed"); assert((await profile.getOwnProfile(studentUser._id)).student.rollNumber === student.rollNumber, "student profile failed");
    await profile.updateSocialLinks(staff._id, { githubUrl: "https://github.com/tiet-user", linkedinUrl: "https://www.linkedin.com/in/tiet-user", email: "changed@example.test", role: "SUPER_ADMIN" });
    await profile.updatePhoto(staff._id, { mimetype: "image/png", size: 8, buffer: Buffer.from("89504e47", "hex") });
    const unchanged = await User.findById(staff._id).lean(); assert(unchanged.email === `phase-staff-${tag}@example.test` && unchanged.accountType === "ADMIN", "profile mass assignment altered identity"); assert(unchanged.metadata.socialLinks.githubUrl.includes("github.com") && unchanged.profilePhotoUrl.startsWith("data:image/png;base64,"), "profile updates failed");
    console.log(JSON.stringify({ passed: 15, independentMasters: true, studentImportWithoutSession: true, societyImportWithoutSession: true, budgetDependency: true, venueDependency: true, unknownBuildingRejected: true, staffProfile: true, studentProfile: true, socialLinks: true, photo: true, massAssignmentBlocked: true }, null, 2));
  } finally {
    await Transaction.deleteMany({ budgetId: { $in: made.budgets } }).catch(() => {}); await Budget.deleteMany({ _id: { $in: made.budgets } }).catch(() => {}); await Venue.deleteMany({ _id: { $in: made.venues } }).catch(() => {}); await Building.deleteMany({ _id: { $in: made.buildings } }).catch(() => {}); await Department.deleteMany({ _id: { $in: made.departments } }).catch(() => {}); await Society.deleteMany({ _id: { $in: made.societies } }).catch(() => {}); await User.deleteMany({ _id: { $in: made.users } }).catch(() => {}); await Student.deleteMany({ _id: { $in: made.students } }).catch(() => {}); await StudentImport.deleteMany({ _id: { $in: made.studentImports } }).catch(() => {}); await SocietyImport.deleteMany({ _id: { $in: made.societyImports } }).catch(() => {}); await MasterImport.deleteMany({ _id: { $in: made.masterImports } }).catch(() => {}); await AcademicSession.updateMany({ _id: { $in: made.sessions } }, { $set: { isCurrent: false } }).catch(() => {}); await AcademicSession.deleteMany({ _id: { $in: made.sessions } }).catch(() => {}); if (originalCurrent) await AcademicSession.updateOne({ _id: originalCurrent._id }, { $set: { isCurrent: true, status: "ACTIVE" } }).catch(() => {}); await disconnectDatabase();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
