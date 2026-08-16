const service=require("./rolePermission.service"),events=require("../../common/events/domainEvent.service");
const get=async(req,res)=>res.json({success:true,data:{permissions:await service.getRolePermissions(req.params.roleId)}});
const replace=async(req,res)=>{const data=await service.replaceRolePermissions(req.params.roleId,req.body.permissions,req.body.updatedBy);events.publish("ROLE_PERMISSIONS_UPDATED",{metadata:{roleId:req.params.roleId}});res.json({success:true,data});};
module.exports={get,replace};
