const service = require("./societyLeadership.service");
const imports = require("./leadershipImport.service");

const createLeadershipAssignment = async (req, res) => {
  const leadership = await service.createLeadershipAssignment({...req.body,createdBy:req.auth.userId});
  res.status(201).json({ success: true, message: "Society leadership assignment created successfully", data: { leadership } });
};
const listLeadershipAssignments = async (req, res) => {
  req.performanceLabel = "societyLeadership.list";
  res.status(200).json({ success: true, data: await service.listLeadershipAssignments(req.leadershipFilters, req) });
};
const getLeadershipAssignment = async (req, res) => res.status(200).json({ success: true, data: { leadership: await service.getLeadershipAssignment(req.params.id) } });
const updateLeadershipAssignment = async (req, res) => res.status(200).json({ success: true, message: "Leadership assignment updated successfully", data: { leadership: await service.updateLeadershipAssignment(req.params.id, req.body) } });
const endLeadershipAssignment = async (req, res) => res.status(200).json({ success: true, message: "Leadership assignment ended successfully", data: { leadership: await service.endLeadershipAssignment(req.params.id, {...req.body,updatedBy:req.auth.userId}) } });
const updateLeadershipStatus = async (req, res) => res.status(200).json({ success: true, message: "Leadership assignment status updated successfully", data: { leadership: await service.updateLeadershipStatus(req.params.id, req.body.status) } });
const getActiveSocietyApprovers = async (req, res) => res.status(200).json({ success: true, data: { leadership: await service.getActiveSocietyApprovers(req.params.societyId, req.academicSession) } });

const importTemplate=async(req,res)=>{const buffer=await imports.template();res.set({"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":'attachment; filename="TIET-Society-Leadership-Import-Template.xlsx"'});res.send(buffer)};
const previewImport=async(req,res)=>res.status(201).json({success:true,data:await imports.preview(req.file,req.auth.userId)});
const confirmImport=async(req,res)=>res.json({success:true,data:await imports.confirm(req.params.importSessionId,req.auth.userId)});
module.exports = { createLeadershipAssignment, listLeadershipAssignments, getLeadershipAssignment, updateLeadershipAssignment, endLeadershipAssignment, updateLeadershipStatus, getActiveSocietyApprovers,importTemplate,previewImport,confirmImport };
