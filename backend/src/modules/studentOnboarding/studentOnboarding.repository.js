const Onboarding = require("./studentOnboarding.model");
const findByUser = (userId) => Onboarding.findOne({ userId });
const findById = (id) => Onboarding.findById(id);
const create = (data) => Onboarding.create(data);
const updateConditional = (filter, data) =>
  Onboarding.findOneAndUpdate(
    filter,
    { $set: data },
    { returnDocument: "after", runValidators: true }
  );
module.exports = { findByUser, findById, create, updateConditional };
