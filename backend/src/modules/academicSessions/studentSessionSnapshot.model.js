const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentMaster", required: true, index: true },
  studentPublicIdSnapshot: { type: String, required: true, index: true },
  academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true, index: true },
  sessionNameSnapshot: { type: String, required: true },
  state: {
    year: String,
    course: String,
    branch: String,
    recordStatus: String,
  },
  source: { type: String, enum: ["SESSION_ROLLOVER"], default: "SESSION_ROLLOVER" },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: "BulkUpdateBatch", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

schema.index({ studentId: 1, academicSessionId: 1 }, { unique: true, name: "one_student_snapshot_per_session" });
module.exports = mongoose.model("StudentSessionSnapshot", schema);
