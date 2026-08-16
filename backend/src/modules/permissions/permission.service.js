const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const repo = require("./permission.repository");
const Permission = require("./permission.model");
const RolePermission = require("../rolePermissions/rolePermission.model");
const valid = (id) =>
  mongoose.Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(String(id));
const getPermission = async (id) => {
  if (!valid(id))
    throw new AppError("Invalid permission ID", 400, "INVALID_PERMISSION_ID");
  const item = await repo.findById(id);
  if (!item)
    throw new AppError("Permission not found", 404, "PERMISSION_NOT_FOUND");
  return item;
};
const audit = (entity, operation, before, after, actorId) => ({
  entity,
  audit: {
    entityType: "Permission",
    entityId: entity.id,
    operation,
    before,
    after,
    actorId: actorId || null,
    metadata: {},
  },
});
const createPermission = async (data) => {
  if (await repo.findByCode(data.code))
    throw new AppError(
      "Permission code already exists",
      409,
      "PERMISSION_CODE_EXISTS"
    );
  try {
    const item = await repo.create(data);
    return audit(item, "CREATE", null, item.toObject(), data.createdBy);
  } catch (e) {
    if (e.code === 11000)
      throw new AppError(
        "Permission code or UI key already exists",
        409,
        "PERMISSION_CODE_EXISTS"
      );
    throw e;
  }
};
const listPermissions = async (f) => {
  const q = {};
  if (f.search)
    q.$or = ["code", "name", "description"].map((k) => ({
      [k]: new RegExp(f.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    }));
  for (const k of [
    "module",
    "resource",
    "action",
    "permissionType",
    "category",
    "status",
  ])
    if (f[k]) q[k] = f[k];
  const r = await repo.findAll(q, f.page, f.limit);
  return {
    items: r.items,
    pagination: {
      page: f.page,
      limit: f.limit,
      totalItems: r.totalItems,
      totalPages: Math.ceil(r.totalItems / f.limit),
    },
  };
};
const updatePermission = async (id, data) => {
  const old = await getPermission(id);
  if (old.isSystemPermission && data.code && data.code !== old.code)
    throw new AppError(
      "System permission code is protected",
      403,
      "SYSTEM_PERMISSION_PROTECTED"
    );
  if (
    data.code &&
    (await Permission.exists({ code: data.code, _id: { $ne: id } }))
  )
    throw new AppError(
      "Permission code already exists",
      409,
      "PERMISSION_CODE_EXISTS"
    );
  const item = await repo.updateById(id, data);
  return audit(item, "UPDATE", old.toObject(), item.toObject(), data.updatedBy);
};
const updateStatus = async (id, status, actorId) => {
  const old = await getPermission(id);
  if (
    status === "DEPRECATED" &&
    (await RolePermission.exists({ permissionId: id, isActive: true }))
  ) {
    /* historical mappings remain; new assignment is blocked */
  }
  const item = await repo.updateById(id, { status, updatedBy: actorId });
  return audit(item, "STATUS_CHANGE", old.toObject(), item.toObject(), actorId);
};
const groupedCatalog = async () => {
  const items = await Permission.find({ status: { $ne: "INACTIVE" } })
    .sort({ module: 1, category: 1, sortOrder: 1, code: 1 })
    .lean();
  return items.reduce((out, p) => {
    out[p.module] ||= {};
    const category = p.category || "Other";
    out[p.module][category] ||= [];
    out[p.module][category].push(p);
    return out;
  }, {});
};
module.exports = {
  createPermission,
  listPermissions,
  getPermission,
  updatePermission,
  updateStatus,
  groupedCatalog,
};
