const mongoose = require("mongoose");
const { attachPublicId } = require("../publicIds/publicId.service");

const semesterSchema = new mongoose.Schema({
  type: { type: String, enum: ["ODD", "EVEN"], required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
}, { _id: false });

const schema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true, maxlength: 30 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ["DRAFT", "ACTIVE", "CLOSED"], default: "DRAFT", index: true },
  isCurrent: { type: Boolean, default: false, index: true },
  description: { type: String, trim: true, maxlength: 1000 },
  semesters: { type: [semesterSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

schema.index({ isCurrent: 1 }, { unique: true, partialFilterExpression: { isCurrent: true }, name: "one_current_academic_session" });
schema.pre("validate", function validateDates() {
  if (this.startDate && this.endDate && this.startDate >= this.endDate) this.invalidate("endDate", "End date must be after start date");
  const seen = new Set();
  for (const semester of this.semesters || []) {
    if (seen.has(semester.type)) this.invalidate("semesters", `Duplicate ${semester.type} semester`);
    seen.add(semester.type);
    if (semester.startDate >= semester.endDate) this.invalidate("semesters", `${semester.type} semester end must be after start`);
    if (this.startDate && this.endDate && (semester.startDate < this.startDate || semester.endDate > this.endDate)) this.invalidate("semesters", `${semester.type} semester must be within the academic session`);
  }
});
attachPublicId(schema, "SESSION", { yearFrom: (document) => document.startDate ? new Date(document.startDate).getUTCFullYear() % 100 : undefined });

module.exports = mongoose.model("AcademicSession", schema);
