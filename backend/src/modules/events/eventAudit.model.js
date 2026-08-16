const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    action: { type: String, required: true, index: true },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actorRoleAssignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserRoleAssignment",
    },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: false }
);
module.exports = mongoose.model("EventAudit", schema);
