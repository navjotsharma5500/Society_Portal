const Permission = require("./permission.model");
const create = (data) => Permission.create(data);
const findById = (id) => Permission.findById(id);
const findByCode = (code) => Permission.findOne({ code });
const findAll = async (filter, page, limit) => {
  const [items, totalItems] = await Promise.all([
    Permission.find(filter)
      .sort({ module: 1, category: 1, sortOrder: 1, code: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Permission.countDocuments(filter),
  ]);
  return { items, totalItems };
};
const updateById = (id, data) =>
  Permission.findByIdAndUpdate(id, data, {
    returnDocument: "after",
    runValidators: true,
  });
module.exports = { create, findById, findByCode, findAll, updateById };
