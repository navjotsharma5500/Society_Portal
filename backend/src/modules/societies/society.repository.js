const Society = require("./society.model");

const create = (data) => Society.create(data);

const findAll = async (filter, page, limit) => {
  const skip = (page - 1) * limit;
  const [items, totalItems] = await Promise.all([
    Society.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Society.countDocuments(filter),
  ]);

  return { items, totalItems };
};

const findById = (id) => Society.findById(id);

const findByCode = (code) => Society.findOne({ code });

const updateById = (id, data) =>
  Society.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

const updateStatus = (id, status, isActive) =>
  Society.findByIdAndUpdate(
    id,
    { status, isActive },
    { new: true, runValidators: true }
  );

module.exports = {
  create,
  findAll,
  findById,
  findByCode,
  updateById,
  updateStatus,
};
