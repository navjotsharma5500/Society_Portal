const service = require("./societyLeadership.service");

const createLeadershipAssignment = async (req, res) => {
  const leadership = await service.createLeadershipAssignment(req.body);
  res.status(201).json({ success: true, message: "Society leadership assignment created successfully", data: { leadership } });
};
const listLeadershipAssignments = async (req, res) => res.status(200).json({ success: true, data: await service.listLeadershipAssignments(req.leadershipFilters) });
const getLeadershipAssignment = async (req, res) => res.status(200).json({ success: true, data: { leadership: await service.getLeadershipAssignment(req.params.id) } });
const updateLeadershipAssignment = async (req, res) => res.status(200).json({ success: true, message: "Leadership assignment updated successfully", data: { leadership: await service.updateLeadershipAssignment(req.params.id, req.body) } });
const endLeadershipAssignment = async (req, res) => res.status(200).json({ success: true, message: "Leadership assignment ended successfully", data: { leadership: await service.endLeadershipAssignment(req.params.id, req.body) } });
const updateLeadershipStatus = async (req, res) => res.status(200).json({ success: true, message: "Leadership assignment status updated successfully", data: { leadership: await service.updateLeadershipStatus(req.params.id, req.body.status) } });
const getActiveSocietyApprovers = async (req, res) => res.status(200).json({ success: true, data: { leadership: await service.getActiveSocietyApprovers(req.params.societyId, req.academicSession) } });

module.exports = { createLeadershipAssignment, listLeadershipAssignments, getLeadershipAssignment, updateLeadershipAssignment, endLeadershipAssignment, updateLeadershipStatus, getActiveSocietyApprovers };
