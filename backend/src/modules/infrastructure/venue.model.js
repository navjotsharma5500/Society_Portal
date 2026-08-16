const mongoose = require("mongoose");
const { attachPublicId } = require("../publicIds/publicId.service");
const { VENUE_TYPES, RECORD_STATUSES } = require("./venue.constants");
const schema = new mongoose.Schema({ name: { type: String, required: true, trim: true }, code: { type: String, required: true, unique: true, trim: true, uppercase: true }, buildingId: { type: mongoose.Schema.Types.ObjectId, ref: "Building", required: true, index: true }, venueType: { type: String, enum: VENUE_TYPES, required: true }, capacity: { type: Number, min: 0 }, description: { type: String, trim: true, maxlength: 1000 }, status: { type: String, enum: RECORD_STATUSES, default: "ACTIVE", index: true }, bookingEnabled: { type: Boolean, default: true, index: true }, sortOrder: { type: Number, default: 0 }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" } }, { timestamps: true });
schema.pre("validate", async function validateBuilding() { if (!this.isNew && !this.isModified("buildingId")) return; const Building = require("./building.model"); if (!this.buildingId || !await Building.exists({ _id: this.buildingId, status: "ACTIVE" })) this.invalidate("buildingId", "An active Building is required"); });
attachPublicId(schema, "VENUE");
module.exports = mongoose.model("Venue", schema);
