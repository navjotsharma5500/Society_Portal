const mongoose = require("mongoose");
const { IMPORT_STATUSES } = require("../societyImport.constants");

const schema = new mongoose.Schema({
  status: { type: String, enum: Object.values(IMPORT_STATUSES), default: IMPORT_STATUSES.PREVIEWED },
  sourceFileName: { type: String, required: true },
  totalRows: { type: Number, required: true },
  validRows: { type: Number, required: true },
  warningRows: { type: Number, required: true },
  invalidRows: { type: Number, required: true },
  normalizedRows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  importSummary: { type: mongoose.Schema.Types.Mixed, default: null },
  importResults: { type: [mongoose.Schema.Types.Mixed], default: [] },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  importedAt: Date,
});

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("SocietyImportSession", schema);
