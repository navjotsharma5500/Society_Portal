const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Student = require("../studentMaster/studentMaster.model");
const AcademicSession = require("./academicSession.model");
const Snapshot = require("./studentSessionSnapshot.model");
const Batch = require("../bulkUpdates/bulkUpdateBatch.model");
const Audit = require("../bulkUpdates/bulkUpdateAudit.model");

const TTL = 60 * 60 * 1000;
const allowedStatuses = new Set(["ACTIVE", "INACTIVE", "ARCHIVED"]);
const id = (value) => mongoose.Types.ObjectId.isValid(value);
const text = (value) => String(value ?? "").trim();
const numericYear = (value) => { const match = text(value).match(/^(?:YEAR\s*)?(\d+)$/i); return match ? Number(match[1]) : null; };
const isFourYearUndergraduate = (course) => /^(B\.?\s*TECH|B\.?\s*E\.?)\b/i.test(text(course));

const suggestProgression = (student) => {
  if (student.recordStatus !== "ACTIVE") return { classification: "INACTIVE_SKIPPED", proposedYear: student.year, proposedStatus: student.recordStatus, reasons: ["STUDENT_NOT_ACTIVE"] };
  const year = numericYear(student.year);
  if (year === 1 || year === 2) return { classification: "READY", proposedYear: String(year + 1), proposedStatus: student.recordStatus, reasons: [] };
  if (year === 3 && isFourYearUndergraduate(student.course)) return { classification: "READY", proposedYear: "4", proposedStatus: student.recordStatus, reasons: [] };
  return { classification: "REVIEW_REQUIRED", proposedYear: student.year, proposedStatus: student.recordStatus, reasons: [year === null ? "NON_NUMERIC_YEAR" : year >= 4 ? "FINAL_OR_UNKNOWN_DURATION" : "COURSE_DURATION_UNCERTAIN"] };
};

const validateSessions = async (sourceSessionId, targetSessionId) => {
  if (!id(sourceSessionId) || !id(targetSessionId)) throw new AppError("Valid source and target sessions are required", 400, "INVALID_ROLLOVER_SESSIONS");
  const sessions = await AcademicSession.find({ _id: { $in: [sourceSessionId, targetSessionId] } }).lean();
  const source = sessions.find((item) => String(item._id) === String(sourceSessionId));
  const target = sessions.find((item) => String(item._id) === String(targetSessionId));
  if (!source || !target) throw new AppError("Source or target academic session was not found", 404, "ACADEMIC_SESSION_NOT_FOUND");
  if (String(source._id) === String(target._id)) throw new AppError("Source and target sessions must differ", 400, "ROLLOVER_SAME_SESSION");
  if (!target.isCurrent) throw new AppError("Rollover target must be the current academic session", 409, "ROLLOVER_TARGET_NOT_CURRENT");
  if (new Date(target.startDate) <= new Date(source.startDate)) throw new AppError("Target session must follow source session", 409, "INVALID_ROLLOVER_CHRONOLOGY");
  return { source, target };
};

const summarize = (rows) => ({
  totalStudents: rows.length,
  suggestedUpdates: rows.filter((row) => row.classification === "READY").length,
  noChange: rows.filter((row) => row.classification === "NO_CHANGE").length,
  reviewRequired: rows.filter((row) => row.classification === "REVIEW_REQUIRED").length,
  inactiveSkipped: rows.filter((row) => row.classification === "INACTIVE_SKIPPED").length,
  alreadyRolledOver: rows.filter((row) => row.classification === "ALREADY_ROLLED_OVER").length,
  invalid: rows.filter((row) => row.classification === "INVALID").length,
});

const rowFor = (student, rolled) => {
  if (!student.publicId) return { studentPublicId: "", rollNumber: student.rollNumber, name: student.name, currentYear: student.year, currentStatus: student.recordStatus, classification: "REVIEW_REQUIRED", reasons: ["PUBLIC_ID_REQUIRED"] };
  if (rolled.has(student.publicId)) return { studentPublicId: student.publicId, rollNumber: student.rollNumber, name: student.name, currentYear: student.year, proposedYear: student.year, currentStatus: student.recordStatus, proposedStatus: student.recordStatus, classification: "ALREADY_ROLLED_OVER", reasons: ["TARGET_SESSION_SNAPSHOT_EXISTS"] };
  return { studentPublicId: student.publicId, rollNumber: student.rollNumber, name: student.name, currentYear: student.year, currentStatus: student.recordStatus, ...suggestProgression(student) };
};

const createBatch = async ({ source, target, rows, actor, sourceFileName }) => {
  const batch = await Batch.create({ recordType: "STUDENT_ROLLOVER", sourceFileName, totalRows: rows.length, summary: summarize(rows), rows, uploadedBy: actor, expiresAt: new Date(Date.now() + TTL), metadata: { sourceSessionId: source._id, sourceSessionName: source.name, targetSessionId: target._id, targetSessionName: target.name } });
  return present(batch);
};
const present = (batch) => ({ batchId: batch.publicId, fromSession: batch.metadata.sourceSessionName, toSession: batch.metadata.targetSessionName, summary: batch.summary, rows: batch.rows });

const prepare = async ({ sourceSessionId, targetSessionId, actor }) => {
  const { source, target } = await validateSessions(sourceSessionId, targetSessionId);
  const [students, existing] = await Promise.all([
    Student.find().select("publicId rollNumber name year course branch recordStatus").lean(),
    Snapshot.find({ academicSessionId: target._id }).select("studentPublicIdSnapshot").lean(),
  ]);
  const rolled = new Set(existing.map((item) => item.studentPublicIdSnapshot));
  return createBatch({ source, target, rows: students.map((student) => rowFor(student, rolled)), actor });
};

const workbook = async (publicId) => {
  const batch = await Batch.findOne({ publicId, recordType: "STUDENT_ROLLOVER" }).lean();
  if (!batch) throw new AppError("Rollover batch not found", 404, "ROLLOVER_BATCH_NOT_FOUND");
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Student Rollover", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [["Student Portal ID","studentPublicId",20],["Roll Number","rollNumber",18],["Student Name","name",28],["Current Year","currentYear",15],["Proposed Year","proposedYear",15],["Current Status","currentStatus",18],["Proposed Status","proposedStatus",18],["Action","classification",22],["Validation Messages","reasons",35]].map(([header,key,width])=>({header,key,width}));
  ws.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}}; ws.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF86172C"}}; ws.autoFilter="A1:I1";
  batch.rows.forEach((row)=>ws.addRow({...row,reasons:(row.reasons||[]).join(", ")}));
  return wb.xlsx.writeBuffer();
};

const upload = async ({ sourceSessionId, targetSessionId, file, actor }) => {
  const { source, target } = await validateSessions(sourceSessionId, targetSessionId);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(file.buffer); const ws = wb.getWorksheet("Student Rollover") || wb.worksheets[0];
  if (!ws) throw new AppError("Student Rollover worksheet is required", 400, "INVALID_ROLLOVER_FILE");
  const headers = new Map(); ws.getRow(1).eachCell((cell,index)=>headers.set(text(cell.value),index));
  const required = ["Student Portal ID","Proposed Year","Proposed Status"];
  if (required.some((header)=>!headers.has(header))) throw new AppError("Rollover workbook headers are invalid", 400, "INVALID_ROLLOVER_FILE");
  const raw=[]; for(let index=2;index<=ws.rowCount;index++){const row=ws.getRow(index),studentPublicId=text(row.getCell(headers.get("Student Portal ID")).value);if(!studentPublicId)continue;raw.push({studentPublicId,proposedYear:text(row.getCell(headers.get("Proposed Year")).value),proposedStatus:text(row.getCell(headers.get("Proposed Status")).value).toUpperCase(),rowNumber:index});}
  const ids=[...new Set(raw.map((row)=>row.studentPublicId))];
  const [students,existing]=await Promise.all([Student.find({publicId:{$in:ids}}).select("publicId rollNumber name year course branch recordStatus").lean(),Snapshot.find({academicSessionId:target._id,studentPublicIdSnapshot:{$in:ids}}).select("studentPublicIdSnapshot").lean()]);
  const map=new Map(students.map((student)=>[student.publicId,student])),rolled=new Set(existing.map((item)=>item.studentPublicIdSnapshot));
  const rows=raw.map((input)=>{const student=map.get(input.studentPublicId);if(!student)return{...input,classification:"INVALID",reasons:["PUBLIC_ID_NOT_FOUND"]};const base=rowFor(student,rolled);if(["ALREADY_ROLLED_OVER","INACTIVE_SKIPPED"].includes(base.classification))return{...base,rowNumber:input.rowNumber};const reasons=[];if(!numericYear(input.proposedYear)||numericYear(input.proposedYear)>12)reasons.push("INVALID_PROPOSED_YEAR");if(!allowedStatuses.has(input.proposedStatus))reasons.push("INVALID_PROPOSED_STATUS");return{...base,rowNumber:input.rowNumber,proposedYear:input.proposedYear,proposedStatus:input.proposedStatus,classification:reasons.length?"REVIEW_REQUIRED":(input.proposedYear===text(student.year)&&input.proposedStatus===student.recordStatus?"NO_CHANGE":"READY"),reasons};});
  return createBatch({source,target,rows,actor,sourceFileName:file.originalname});
};

const execute = async (batch, actor, mongoSession) => {
  const ready=batch.rows.filter((row)=>row.classification==="READY"),ids=ready.map((row)=>row.studentPublicId);
  const [students,existing]=await Promise.all([Student.find({publicId:{$in:ids}}).session(mongoSession||null),Snapshot.find({academicSessionId:batch.metadata.targetSessionId,studentPublicIdSnapshot:{$in:ids}}).session(mongoSession||null).lean()]);
  const map=new Map(students.map((student)=>[student.publicId,student])),rolled=new Set(existing.map((item)=>item.studentPublicIdSnapshot)),applied=[];
  for(const row of ready){const student=map.get(row.studentPublicId);if(!student||rolled.has(row.studentPublicId)||text(student.year)!==text(row.currentYear)||student.recordStatus!==row.currentStatus)continue;const before={year:student.year,course:student.course,branch:student.branch,recordStatus:student.recordStatus},after={...before,year:row.proposedYear,recordStatus:row.proposedStatus};applied.push({student,before,after});}
  if(applied.length){
    const snapshotOperations=applied.flatMap(({student,before,after})=>[[batch.metadata.sourceSessionId,batch.metadata.sourceSessionName,before],[batch.metadata.targetSessionId,batch.metadata.targetSessionName,after]].map(([academicSessionId,sessionNameSnapshot,state])=>({updateOne:{filter:{studentId:student._id,academicSessionId},update:{$setOnInsert:{studentPublicIdSnapshot:student.publicId,sessionNameSnapshot,state,source:"SESSION_ROLLOVER",batchId:batch._id,createdBy:actor}},upsert:true}})));
    await Snapshot.bulkWrite(snapshotOperations,{ordered:true,session:mongoSession||undefined});
    await Student.bulkWrite(applied.map(({student,before,after})=>({updateOne:{filter:{_id:student._id,year:before.year,recordStatus:before.recordStatus},update:{$set:{year:after.year,recordStatus:after.recordStatus,updatedBy:actor}}}})),{ordered:true,session:mongoSession||undefined});
  }
  if(applied.length)await Audit.insertMany(applied.flatMap(({student,before,after})=>["year","recordStatus"].filter((field)=>before[field]!==after[field]).map((field)=>({batchId:batch._id,recordType:"STUDENT",recordPublicId:student.publicId,field,previousValue:before[field],newValue:after[field],changedBy:actor,operationSource:"SESSION_ROLLOVER"}))),{session:mongoSession||undefined});
  batch.status="COMPLETED";batch.confirmedBy=actor;batch.confirmedAt=new Date();batch.expiresAt=undefined;batch.summary={...batch.summary,updated:applied.length,skipped:batch.rows.length-applied.length};await batch.save({session:mongoSession||undefined});return{batchId:batch.publicId,summary:batch.summary};
};

const confirm = async (publicId, actor) => {
  const batch=await Batch.findOne({publicId,recordType:"STUDENT_ROLLOVER",status:"PREVIEWED",expiresAt:{$gt:new Date()}});if(!batch)throw new AppError("Rollover batch not found, expired, or already confirmed",409,"ROLLOVER_BATCH_UNAVAILABLE");
  const {target}=await validateSessions(batch.metadata.sourceSessionId,batch.metadata.targetSessionId); if(String(target._id)!==String(batch.metadata.targetSessionId))throw new AppError("Target session changed",409,"ROLLOVER_TARGET_CHANGED");
  const session=await mongoose.startSession();try{let result;await session.withTransaction(async()=>{result=await execute(batch,actor,session)});return result;}catch(error){if([20,117].includes(error.code)||/transaction|replica set|sharded cluster/i.test(error.message||""))return execute(batch,actor);throw error;}finally{await session.endSession();}
};

const history = async () => (await Batch.find({recordType:"STUDENT_ROLLOVER"}).sort({createdAt:-1}).limit(100).populate("confirmedBy","displayName publicId").lean()).map((batch)=>({batchId:batch.publicId,fromSession:batch.metadata.sourceSessionName,toSession:batch.metadata.targetSessionName,date:batch.confirmedAt||batch.createdAt,performedBy:batch.confirmedBy?.displayName||null,total:batch.totalRows,updated:batch.summary?.updated||0,skipped:batch.summary?.skipped||batch.summary?.inactiveSkipped||0,reviewRequired:batch.summary?.reviewRequired||0,status:batch.status}));
module.exports={suggestProgression,validateSessions,prepare,workbook,upload,confirm,history};
