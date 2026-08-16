const mongoose = require("mongoose");
const schema = new mongoose.Schema({ year: { type: Number, required: true }, entityType: { type: String, required: true }, sequence: { type: Number, default: 0 } }, { timestamps: true });
schema.index({ year: 1, entityType: 1 }, { unique: true });
module.exports = mongoose.model("PublicIdCounter", schema);
