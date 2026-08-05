const Assignment = require("./userRoleAssignment.model");
const create = data => Assignment.create(data); const findById = id => Assignment.findById(id).populate("roleId");
const findAll = async (filter, page, limit) => { const [items, totalItems] = await Promise.all([Assignment.find(filter).populate("roleId").populate("societyId").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Assignment.countDocuments(filter)]); return { items, totalItems }; };
const updateById = (id, data) => Assignment.findByIdAndUpdate(id, data, { returnDocument: "after", runValidators: true }).populate("roleId");
module.exports = { create, findById, findAll, updateById };
