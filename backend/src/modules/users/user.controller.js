const service = require("./user.service");
const imports = require("./userImport.service");
const create = async (req, res) =>
  res
    .status(201)
    .json({
      success: true,
      data: { user: await service.createUser(req.body) },
    });
const list = async (req, res) =>
  res.json({ success: true, data: await service.listUsers(req.userFilters) });
const get = async (req, res) =>
  res.json({
    success: true,
    data: { user: await service.getUser(req.params.userId) },
  });
const update=async(req,res)=>res.json({success:true,data:{user:await service.updateUser(req.params.userId,req.body)}});
const status = async (req, res) =>
  res.json({
    success: true,
    data: { user: await service.updateStatus(req.params.userId, req.body) },
  });
const login = async (req, res) =>
  res.json({
    success: true,
    data: {
      user: await service.updateLoginAccess(req.params.userId, req.body),
    },
  });
const effectivePermissions = async (req, res) => res.json({ success: true, data: await service.getEffectivePermissions(req.params.userId) });
const importTemplate=async(req,res)=>{const buffer=await imports.template();res.set({"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":'attachment; filename="TIET-Staff-User-Import-Template.xlsx"'});res.send(buffer)};
const previewImport=async(req,res)=>res.status(201).json({success:true,data:await imports.preview(req.file,req.auth.userId)});
const confirmImport=async(req,res)=>res.json({success:true,data:await imports.confirm(req.params.importSessionId,req.auth.userId)});
module.exports = { create, list, get, update, status, login, effectivePermissions,importTemplate,previewImport,confirmImport };
