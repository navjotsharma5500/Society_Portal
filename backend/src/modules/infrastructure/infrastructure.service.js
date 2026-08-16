const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Building = require("./building.model");
const Venue = require("./venue.model");
const createVenue = async (data, actorId) => {
  if (!mongoose.Types.ObjectId.isValid(data.buildingId) || !await Building.exists({ _id: data.buildingId, status: "ACTIVE" })) throw new AppError("Please add a Building first.", 409, "ACTIVE_BUILDING_REQUIRED");
  return Venue.create({ ...data, code: data.code?.trim().toUpperCase(), updatedBy: actorId, createdBy: actorId });
};
module.exports = { createVenue };
