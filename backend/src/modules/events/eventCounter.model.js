const mongoose = require("mongoose");
module.exports = mongoose.model(
  "EventCounter",
  new mongoose.Schema(
    { _id: { type: String }, value: { type: Number, default: 0 } },
    { versionKey: false }
  )
);
