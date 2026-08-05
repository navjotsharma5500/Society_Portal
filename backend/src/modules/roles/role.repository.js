const Role = require("./role.model");
const create = data => Role.create(data); const findById = id => Role.findById(id); const findByCode = code => Role.findOne({ code });
const findAll = async (filter, page, limit) => { const [items, totalItems] = await Promise.all([Role.find(filter).sort({ rank: -1, name: 1 }).skip((page - 1) * limit).limit(limit), Role.countDocuments(filter)]); return { items, totalItems }; };
const updateById = (id, data) => Role.findByIdAndUpdate(id, data, { returnDocument: "after", runValidators: true });
module.exports = { create, findById, findByCode, findAll, updateById };
