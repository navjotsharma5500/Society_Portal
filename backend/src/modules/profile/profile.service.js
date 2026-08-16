const AppError = require("../../common/errors/AppError");
const User = require("../users/user.model");
const Student = require("../studentMaster/studentMaster.model");
const Assignment = require("../userRoleAssignments/userRoleAssignment.model");
const Membership = require("../societyMemberships/societyMembership.model");
const Leadership = require("../societyLeadership/societyLeadership.model");
const photoStorage = require("./profilePhotoStorage.service");
const events = require("../../common/events/domainEvent.service");

const socialUrl = (value, host, field) => {
  if (!value) return null;
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw new AppError(`${field} must be a valid URL.`, 400, "INVALID_PROFILE_URL"); }
  if (parsed.protocol !== "https:" || !(parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) throw new AppError(`${field} must be an HTTPS ${host} URL.`, 400, "INVALID_PROFILE_URL");
  return parsed.toString();
};
const getOwnProfile = async (userId) => {
  const user = await User.findById(userId).select("-googleSubject").lean();
  if (!user) throw new AppError("Profile not found", 404, "PROFILE_NOT_FOUND");
  const [student, assignments, memberships, leadership] = await Promise.all([
    user.studentMasterId ? Student.findById(user.studentMasterId).select("name email contactNumber rollNumber course branch year profilePictureUrl").lean() : null,
    Assignment.find({ userId, status: "ACTIVE", isOngoing: true }).populate("roleId", "name code rank").populate("societyId", "name code publicId").sort({ isPrimary: -1 }).lean(),
    Membership.find({ userId }).populate("societyId", "name code publicId").populate("roleId", "name code").sort({ startDate: -1 }).lean(),
    Leadership.find({ email: user.email, status: "ACTIVE", isOngoing: true }).populate("societyId", "name code publicId").lean(),
  ]);
  const primary = assignments.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (b.roleId?.rank || 0) - (a.roleId?.rank || 0))[0];
  return {
    user: { publicId: user.publicId, displayName: student?.name || user.displayName, email: user.email, contactNumber: student?.contactNumber || user.metadata?.contactNumber || null, department: user.metadata?.department || leadership[0]?.department || null, accountType: user.accountType, profilePhotoUrl: user.profilePhotoUrl || user.profilePictureUrl || student?.profilePictureUrl || null, githubUrl: user.metadata?.socialLinks?.githubUrl || null, linkedinUrl: user.metadata?.socialLinks?.linkedinUrl || null },
    student: student ? { rollNumber: student.rollNumber, course: student.course, branch: student.branch, year: student.year } : null,
    primaryRole: primary?.roleId ? { code: primary.roleId.code, name: primary.roleId.name } : null,
    roles: assignments.map((item) => ({ assignmentId: item._id, scopeType: item.scopeType, roleCode: item.roleId?.code, roleName: item.roleId?.name, society: item.societyId ? { code: item.societyId.code, name: item.societyId.name, publicId: item.societyId.publicId } : null })),
    memberships: memberships.map((item) => ({ publicId: item.publicId, roleName: item.roleId?.name || item.roleName, status: item.status, isOngoing: item.isOngoing, society: item.societyId ? { code: item.societyId.code, name: item.societyId.name, publicId: item.societyId.publicId } : null })),
    leadership: leadership.map((item) => ({ role: item.role, designation: item.designation, department: item.department, society: item.societyId ? { code: item.societyId.code, name: item.societyId.name, publicId: item.societyId.publicId } : null })),
  };
};
const updateSocialLinks = async (userId, input) => {
  const githubUrl = socialUrl(input.githubUrl?.trim(), "github.com", "GitHub URL"), linkedinUrl = socialUrl(input.linkedinUrl?.trim(), "linkedin.com", "LinkedIn URL");
  const user = await User.findById(userId); if (!user) throw new AppError("Profile not found", 404, "PROFILE_NOT_FOUND");
  user.metadata = { ...(user.metadata || {}), socialLinks: { githubUrl, linkedinUrl } }; await user.save(); events.publish("PROFILE_UPDATED",{userId,metadata:{fields:["socialLinks"]}}); return getOwnProfile(userId);
};
const updatePhoto = async (userId, file) => { const profilePhotoUrl = await photoStorage.store(file); const user = await User.findByIdAndUpdate(userId, { $set: { profilePhotoUrl } }, { returnDocument: "after" }); if (!user) throw new AppError("Profile not found", 404, "PROFILE_NOT_FOUND"); events.publish("PROFILE_UPDATED",{userId,metadata:{fields:["profilePhotoUrl"]}}); return { profilePhotoUrl }; };
module.exports = { getOwnProfile, updateSocialLinks, updatePhoto };
