const Claim = require("./societyClaim.model");
const create = (data) => Claim.create(data);
const findById = (id) => Claim.findById(id);
const findForOnboarding = (id) =>
  Claim.find({ onboardingId: id }).sort({ createdAt: 1 });
const updateConditional = (filter, data) =>
  Claim.findOneAndUpdate(
    filter,
    { $set: data },
    { returnDocument: "after", runValidators: true }
  );
const removeDraft = (filter) =>
  Claim.findOneAndDelete({ ...filter, status: "DRAFT" });
module.exports = {
  create,
  findById,
  findForOnboarding,
  updateConditional,
  removeDraft,
};
