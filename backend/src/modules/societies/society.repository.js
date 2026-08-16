const Society = require("./society.model");

const create = (data) => Society.create(data);

const performance = require("../../common/performance/performance");

const findAll = async (filter, page, limit, req) => {
  const skip = (page - 1) * limit;
  const queryStartedAt = performance.now();
  const countStartedAt = performance.now();
  const [items, totalItems] = await Promise.all([
    Society.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
      .then((value) => { performance.mark(req, "queryMs", queryStartedAt); return value; }),
    Society.countDocuments(filter)
      .then((value) => { performance.mark(req, "countMs", countStartedAt); return value; }),
  ]);

  return { items, totalItems };
};

const findById = (id) => Society.findById(id).lean();

const findByCode = (code) => Society.findOne({ code }).lean();

const updateById = (id, data) =>
  Society.findByIdAndUpdate(id, data, {
    returnDocument: "after",
    runValidators: true,
  });

const updateStatus = (id, status, isActive) =>
  Society.findByIdAndUpdate(
    id,
    { status, isActive },
    { returnDocument: "after", runValidators: true }
  );

module.exports = {
  create,
  findAll,
  findById,
  findByCode,
  updateById,
  updateStatus,
};
