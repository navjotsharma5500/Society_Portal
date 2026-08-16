const service = require("./permission.service");
const create = async (req, res) => {
  const result = await service.createPermission({ ...req.body, createdBy: req.auth.userId });
  res
    .status(201)
    .json({
      success: true,
      data: { permission: result.entity, audit: result.audit },
    });
};
const list = async (req, res) =>
  res.json({
    success: true,
    data: await service.listPermissions(req.permissionFilters),
  });
const get = async (req, res) =>
  res.json({
    success: true,
    data: { permission: await service.getPermission(req.params.permissionId) },
  });
const update = async (req, res) => {
  const r = await service.updatePermission(req.params.permissionId, { ...req.body, updatedBy: req.auth.userId });
  res.json({ success: true, data: { permission: r.entity, audit: r.audit } });
};
const status = async (req, res) => {
  const r = await service.updateStatus(
    req.params.permissionId,
    req.body.status,
    req.auth.userId
  );
  res.json({ success: true, data: { permission: r.entity, audit: r.audit } });
};
const grouped = async (req, res) =>
  res.json({
    success: true,
    data: { catalog: await service.groupedCatalog() },
  });
module.exports = { create, list, get, update, status, grouped };
