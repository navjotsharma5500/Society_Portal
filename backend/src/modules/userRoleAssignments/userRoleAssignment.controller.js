const service=require("./userRoleAssignment.service"),auth=require("../authorization/authorization.service");
const create=async(req,res)=>{const r=await service.createAssignment(req.body);res.status(201).json({success:true,data:{assignment:r.entity,audit:r.audit}})};
const list=async(req,res)=>res.json({success:true,data:await service.listAssignments(req.assignmentFilters)});
const get=async(req,res)=>res.json({success:true,data:{assignment:await service.getAssignment(req.params.assignmentId)}});
const update=async(req,res)=>{const r=await service.updateAssignment(req.params.assignmentId,req.body);res.json({success:true,data:{assignment:r.entity,audit:r.audit}})};
const finish=method=>async(req,res)=>{const r=await service[method](req.params.assignmentId,req.body?.updatedBy,req.body?.remarks);res.json({success:true,data:{assignment:r.entity,audit:r.audit}})};
const active=async(req,res)=>res.json({success:true,data:{assignments:await service.getActiveForUser(req.params.userId)}});
const effective=async(req,res)=>{const e=await auth.getEffectivePermissions({userId:req.params.userId,societyId:req.query.societyId});res.json({success:true,data:{userId:req.params.userId,societyId:req.query.societyId||null,assignments:e.assignments,permissions:e.permissions,uiKeys:(await auth.getUiCapabilities({userId:req.params.userId,societyId:req.query.societyId})).uiKeys,primaryDashboardRole:await auth.resolvePrimaryDashboardRole(req.params.userId)}})};
module.exports={create,list,get,update,end:finish("endAssignment"),revoke:finish("revokeAssignment"),active,effective};
