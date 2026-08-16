const mongoose = require("mongoose");
const changeSchema = new mongoose.Schema(
  {
    fieldPath: { type: String, required: true },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);
const schema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    workflowStage: { type: String, required: true, index: true },
    revisionNumber: { type: Number, required: true, min: 1 },
    changedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    changedByRoleCode: { type: String, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 3000 },
    changes: { type: [changeSchema], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ eventId: 1, revisionNumber: 1 }, { unique: true });
module.exports = mongoose.model("EventAmendment", schema);
