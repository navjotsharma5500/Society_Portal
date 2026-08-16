const societyService = require("./society.service");
const societyTeamService = require("./societyTeam.service");
const teamManagement = require("./societyTeamManagement.service");

const createSociety = async (req, res) => {
  const society = await societyService.createSociety(req.body);
  res.status(201).json({
    success: true,
    message: "Society created successfully",
    data: { society },
  });
};

const listSocieties = async (req, res) => {
  req.performanceLabel = "societies.list";
  const data = await societyService.listSocieties(req.societyFilters, req);
  res.status(200).json({ success: true, data });
};

const getSociety = async (req, res) => {
  const society = await societyService.getSociety(req.params.id);
  res.status(200).json({ success: true, data: { society } });
};
const getCurrentTeam = async (req, res) => res.status(200).json({ success: true, data: await societyTeamService.getCurrentTeam(req.params.id, req.query) });
const teamRoles=async(req,res)=>res.json({success:true,data:{items:await teamManagement.roles()}});
const searchTeamPeople=async(req,res)=>res.json({success:true,data:{items:await teamManagement.searchPeople(req.params.id,req.query.search)}});
const assignTeamRole=async(req,res)=>res.status(201).json({success:true,data:{assignment:await teamManagement.assign({...req.body,societyId:req.params.id,actorId:req.auth.userId})}});
const endTeamTenure=async(req,res)=>res.json({success:true,data:{assignment:await teamManagement.end({societyId:req.params.id,assignmentId:req.params.assignmentId,actorId:req.auth.userId,remarks:req.body?.remarks})}});
const teamTemplate=async(req,res)=>{const buffer=await teamManagement.template();res.set({"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename=TIET-Society-Team-${req.params.id}.xlsx`});res.send(buffer)};
const previewTeamImport=async(req,res)=>res.status(201).json({success:true,data:await teamManagement.preview({societyId:req.params.id,file:req.file,actorId:req.auth.userId})});
const confirmTeamImport=async(req,res)=>res.json({success:true,data:await teamManagement.confirm({societyId:req.params.id,sessionId:req.params.sessionId,actorId:req.auth.userId})});
const resyncTeam=async(req,res)=>res.json({success:true,data:await teamManagement.resync({societyId:req.params.id,actorId:req.auth.userId})});

const updateSociety = async (req, res) => {
  const society = await societyService.updateSociety(req.params.id, req.body);
  res.status(200).json({ success: true, data: { society } });
};

const updateSocietyStatus = async (req, res) => {
  const society = await societyService.updateSocietyStatus(
    req.params.id,
    req.body.status
  );
  res.status(200).json({ success: true, data: { society } });
};

module.exports = {
  createSociety,
  listSocieties,
  getSociety,
  updateSociety,
  updateSocietyStatus,
  getCurrentTeam,
  teamRoles,searchTeamPeople,assignTeamRole,endTeamTenure,teamTemplate,previewTeamImport,confirmTeamImport,resyncTeam,
};
