const Model = require("./membershipRequest.model");
module.exports = {
  create: (d) => Model.create(d),
  findById: (id) => Model.findById(id),
  Model,
};
