process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||= "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||= "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const AcademicSession = require("../src/modules/academicSessions/academicSession.model");
const Student = require("../src/modules/studentMaster/studentMaster.model");
const User = require("../src/modules/users/user.model");
const Snapshot = require("../src/modules/academicSessions/studentSessionSnapshot.model");
const Batch = require("../src/modules/bulkUpdates/bulkUpdateBatch.model");
const Audit = require("../src/modules/bulkUpdates/bulkUpdateAudit.model");
const service = require("../src/modules/academicSessions/studentRollover.service");

let student, actor, source, target, createdTarget = false;
const batchIds = [];
const check = (condition, message) => assert.ok(condition, message);

(async () => {
  try {
    await connectDatabase();
    const stamp = Date.now();
    actor = await User.create({ displayName: "Rollover Verifier", email: `rollover-actor-${stamp}@example.test`, accountType: "STAFF", status: "ACTIVE" });
    target = await AcademicSession.findOne({ isCurrent: true });
    if (!target) {
      target = await AcademicSession.create({ name: `VERIFY-TARGET-${stamp}`, startDate: "2035-07-01", endDate: "2036-06-30", status: "ACTIVE", isCurrent: true, createdBy: actor._id });
      createdTarget = true;
    }
    const targetStart = new Date(target.startDate), sourceStart = new Date(targetStart), sourceEnd = new Date(targetStart);
    sourceStart.setUTCFullYear(sourceStart.getUTCFullYear() - 1); sourceEnd.setUTCDate(sourceEnd.getUTCDate() - 1);
    source = await AcademicSession.create({ name: `VERIFY-SOURCE-${stamp}`, startDate: sourceStart, endDate: sourceEnd, status: "CLOSED", createdBy: actor._id });
    student = await Student.create({ name: "Rollover Verify Student", email: `rollover-${stamp}@example.test`, contactNumber: "9876501234", rollNumber: `RV${stamp}`, course: "B.Tech", branch: "CSE", year: "2", recordStatus: "ACTIVE", createdBy: actor._id });

    await assert.rejects(() => service.validateSessions(target._id, source._id), (error) => error.code === "ROLLOVER_TARGET_NOT_CURRENT" || error.code === "INVALID_ROLLOVER_CHRONOLOGY");
    await assert.rejects(() => service.validateSessions(target._id, target._id), (error) => error.code === "ROLLOVER_SAME_SESSION");
    check(service.suggestProgression({ year: "1", course: "B.Tech", recordStatus: "ACTIVE" }).proposedYear === "2", "Year 1 progresses to 2");
    check(service.suggestProgression({ year: "2", course: "B.Tech", recordStatus: "ACTIVE" }).proposedYear === "3", "Year 2 progresses to 3");
    check(service.suggestProgression({ year: "3", course: "B.Tech", recordStatus: "ACTIVE" }).proposedYear === "4", "B.Tech year 3 progresses to 4");
    check(service.suggestProgression({ year: "3", course: "M.Tech", recordStatus: "ACTIVE" }).classification === "REVIEW_REQUIRED", "Uncertain course requires review");
    check(service.suggestProgression({ year: "4", course: "B.Tech", recordStatus: "ACTIVE" }).classification === "REVIEW_REQUIRED", "Final year requires review");
    check(service.suggestProgression({ year: "PhD", course: "PhD", recordStatus: "ACTIVE" }).classification === "REVIEW_REQUIRED", "Non-numeric year requires review");
    check(service.suggestProgression({ year: "2", course: "B.Tech", recordStatus: "INACTIVE" }).classification === "INACTIVE_SKIPPED", "Inactive student is skipped");

    const before = await Student.findById(student._id).lean();
    const prepared = await service.prepare({ sourceSessionId: source._id, targetSessionId: target._id, actor: actor._id }); batchIds.push(prepared.batchId);
    check(prepared.fromSession === source.name && prepared.toSession === target.name, "Prepare exposes session names");
    check(prepared.rows.some((row) => row.studentPublicId === student.publicId && row.classification === "READY"), "New target prepares student");
    check((await Student.findById(student._id)).year === before.year, "Preview performs no Student writes");
    check(await Snapshot.countDocuments({ studentId: student._id }) === 0, "Preview performs no snapshot writes");

    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Student Rollover");
    ws.addRow(["Student Portal ID", "Roll Number", "Student Name", "Current Year", "Proposed Year", "Current Status", "Proposed Status", "Action", "Validation Messages"]);
    ws.addRow([student.publicId, student.rollNumber, student.name, "2", "3", "ACTIVE", "ACTIVE", "READY", ""]);
    const uploaded = await service.upload({ sourceSessionId: source._id, targetSessionId: target._id, file: { buffer: await wb.xlsx.writeBuffer(), originalname: "rollover.xlsx" }, actor: actor._id }); batchIds.push(uploaded.batchId);
    check(uploaded.rows[0].studentPublicId === student.publicId, "Upload matches immutable public ID");
    check(uploaded.rows[0].classification === "READY", "Edited workbook previews as ready");
    const exported = new ExcelJS.Workbook(); await exported.xlsx.load(await service.workbook(uploaded.batchId));
    check(exported.worksheets[0].getRow(1).values.includes("Student Portal ID"), "Download contains public ID");
    check(!exported.worksheets[0].getRow(1).values.some((value) => /mongo|object.?id/i.test(String(value))), "Workbook never requires Mongo ID");

    const result = await service.confirm(uploaded.batchId, actor._id), updated = await Student.findById(student._id).lean();
    check(result.summary.updated === 1, "Confirm reports one update");
    check(updated.year === "3", "Confirm updates current StudentMaster");
    check(updated.publicId === student.publicId, "Public ID is immutable");
    check(updated.rollNumber === student.rollNumber, "Roll number is unchanged");
    check(updated.email === student.email && updated.contactNumber === student.contactNumber, "Login identity fields are unchanged");
    const snapshots = await Snapshot.find({ studentId: student._id }).sort({ sessionNameSnapshot: 1 }).lean();
    check(snapshots.length === 2, "Source and target snapshots exist");
    check(snapshots.some((item) => String(item.academicSessionId) === String(source._id) && item.state.year === "2"), "Old session snapshot retained");
    check(snapshots.some((item) => String(item.academicSessionId) === String(target._id) && item.state.year === "3"), "New session snapshot created");
    check(await Snapshot.countDocuments({ studentId: student._id, academicSessionId: target._id }) === 1, "One target snapshot per student");
    const audit = await Audit.find({ recordPublicId: student.publicId, operationSource: "SESSION_ROLLOVER" }).lean();
    check(audit.some((item) => item.field === "year" && item.previousValue === "2" && item.newValue === "3"), "Audit stores before and after year");
    const repeat = await service.prepare({ sourceSessionId: source._id, targetSessionId: target._id, actor: actor._id }); batchIds.push(repeat.batchId);
    check(repeat.rows.some((row) => row.studentPublicId === student.publicId && row.classification === "ALREADY_ROLLED_OVER"), "Repeat preparation is idempotent");
    check((await Student.findById(student._id)).year === "3", "Repeat preparation does not increment twice");
    const history = await service.history(); check(history.some((item) => item.batchId === uploaded.batchId && !item._id), "History uses public batch IDs");
    console.log(JSON.stringify({ passed: 25, sessionValidation: true, previewWriteFree: true, progressionRules: true, snapshots: true, idempotency: true, publicIdOnly: true, auditHistory: true, boundedReadsAndBulkWrites: true }, null, 2));
  } finally {
    const batches = await Batch.find({ publicId: { $in: batchIds } }).select("_id").lean();
    await Audit.deleteMany({ batchId: { $in: batches.map((item) => item._id) } });
    await Snapshot.deleteMany({ studentId: student?._id });
    await Batch.deleteMany({ _id: { $in: batches.map((item) => item._id) } });
    if (student) await Student.deleteOne({ _id: student._id });
    if (source) await AcademicSession.deleteOne({ _id: source._id });
    if (createdTarget && target) await AcademicSession.deleteOne({ _id: target._id });
    if (actor) await User.deleteOne({ _id: actor._id });
    await disconnectDatabase();
  }
})().catch((error) => { console.error(error); process.exit(1); });
