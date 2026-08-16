const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Society = require("./society.model");
const Assignment = require("../userRoleAssignments/userRoleAssignment.model");
const Membership = require("../societyMemberships/societyMembership.model");
const Leadership = require("../societyLeadership/societyLeadership.model");
const User = require("../users/user.model");
const Student = require("../studentMaster/studentMaster.model");
const { resolveProfilePicture } = require("../identity/profilePicture");

const MAX_TEAM_RECORDS = 2000;
const activeWindow = (now) => ({
  status: "ACTIVE",
  $or: [
    { isOngoing: true },
    { $and: [
      { $or: [{ validFrom: null }, { validFrom: { $exists: false } }, { validFrom: { $lte: now } }] },
      { $or: [{ validUntil: null }, { validUntil: { $exists: false } }, { validUntil: { $gte: now } }] },
    ] },
  ],
});
const normalized = (value) => String(value || "").trim().toLowerCase();

const getCurrentTeam = async (societyId, options = {}) => {
  if (!mongoose.Types.ObjectId.isValid(societyId)) throw new AppError("Society not found", 404, "SOCIETY_NOT_FOUND");
  if (!(await Society.exists({ _id: societyId }))) throw new AppError("Society not found", 404, "SOCIETY_NOT_FOUND");
  const now = new Date();
  const [assignments, memberships, leadershipLinks] = await Promise.all([
    Assignment.find({ societyId, scopeType: "SOCIETY", ...activeWindow(now) })
      .select("userId roleId academicSession validFrom validUntil isOngoing status")
      .populate("roleId", "name code rank category scopeType isLeadershipRole status")
      .sort({ createdAt: -1 }).limit(MAX_TEAM_RECORDS).lean(),
    Membership.find({ societyId, status: "ACTIVE", isOngoing: true })
      .select("userId studentMasterId roleId academicSession startDate endDate isOngoing status")
      .populate("roleId", "name code rank category scopeType isLeadershipRole status")
      .sort({ createdAt: -1 }).limit(MAX_TEAM_RECORDS).lean(),
    Leadership.find({societyId,status:"ACTIVE",isOngoing:true,userId:{$ne:null}}).select("userId role").lean(),
  ]);
  const leadershipLinkMap=new Map(leadershipLinks.map(item=>[`${item.userId}|${item.role}`,item._id]));
  const userIds = [...new Set([...assignments, ...memberships].map((item) => String(item.userId)).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } }).select("displayName email publicId accountType profilePhotoUrl profilePictureUrl studentMasterId metadata").lean();
  const studentIds = [...new Set([...memberships.map((item) => String(item.studentMasterId)), ...users.map((user) => String(user.studentMasterId || ""))].filter(Boolean))];
  const students = await Student.find({ _id: { $in: studentIds } }).select("name email publicId rollNumber contactNumber branch course profilePictureUrl").lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const studentMap = new Map(students.map((student) => [String(student._id), student]));
  const records = new Map();
  const add = (item, source) => {
    const role = item.roleId;
    if (!role || role.status !== "ACTIVE") return;
    const user = userMap.get(String(item.userId));
    const student = source === "MEMBERSHIP" ? studentMap.get(String(item.studentMasterId)) : studentMap.get(String(user?.studentMasterId));
    if (!user && !student) return;
    const key = `${item.userId}|${role._id}`;
    const person = {
      userId: item.userId,
      studentMasterId: student?._id || null,
      name: user?.displayName || student?.name,
      photoUrl: resolveProfilePicture(user, student),
      email: user?.email || student?.email,
      contact: student?.contactNumber || user?.metadata?.contactNumber || user?.metadata?.contact || null,
      rollNumber: student?.rollNumber || null,
      department: user?.metadata?.department || student?.branch || null,
      designation: user?.metadata?.designation || (student ? "Student" : null),
      publicId: user?.publicId || student?.publicId || null,
      role: { id: role._id, name: role.name, code: role.code, rank: role.rank || 0, category: role.category, scope: role.scopeType, isLeadershipRole: Boolean(role.isLeadershipRole) },
      academicSession: item.academicSession || null,
      startDate: item.validFrom || item.startDate || null,
      isOngoing: true,
      source,
      assignmentId: source === "ASSIGNMENT" ? item._id : item.linkedUserRoleAssignmentId || null,
      leadershipId: leadershipLinkMap.get(`${item.userId}|${role.code}`) || null,
    };
    if (!records.has(key) || source === "ASSIGNMENT") records.set(key, person);
  };
  memberships.forEach((item) => add(item, "MEMBERSHIP"));
  assignments.forEach((item) => add(item, "ASSIGNMENT"));
  const search = normalized(options.search);
  const sorted = [...records.values()].filter((person) => !search || [person.name, person.rollNumber, person.email, person.publicId, person.role.name, person.role.code].some((value) => normalized(value).includes(search))).sort((a, b) => b.role.rank - a.role.rank || a.role.name.localeCompare(b.role.name) || a.name.localeCompare(b.name));
  const highestByPerson = new Map();
  for (const person of sorted) if (!highestByPerson.has(String(person.userId))) highestByPerson.set(String(person.userId), person);
  const resolved = [...highestByPerson.values()];
  const leadership = resolved.filter((person) => person.role.isLeadershipRole);
  const allMembers = resolved.filter((person) => !person.role.isLeadershipRole);
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 25));
  return {
    leadership,
    members: allMembers.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, totalItems: allMembers.length, totalPages: Math.ceil(allMembers.length / limit) },
    query: { assignmentRecords: assignments.length, membershipRecords: memberships.length, maxRecordsPerSource: MAX_TEAM_RECORDS },
  };
};

module.exports = { getCurrentTeam };
