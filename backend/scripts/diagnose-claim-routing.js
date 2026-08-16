process.env.GOOGLE_CLIENT_ID ||= "diagnostic-client";
process.env.JWT_ACCESS_SECRET ||= "diagnostic-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||= "diagnostic-refresh-secret-32-characters-long";

const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const Claim = require("../src/modules/societyClaims/societyClaim.model");
const Society = require("../src/modules/societies/society.model");
const Role = require("../src/modules/roles/role.model");
const Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model");
const User = require("../src/modules/users/user.model");
const Mapping = require("../src/modules/rolePermissions/rolePermission.model");
const Permission = require("../src/modules/permissions/permission.model");
const Leadership = require("../src/modules/societyLeadership/societyLeadership.model");

const CAPABILITY = { HIGHER: "verification.claim.review.higher_roles", LOWER: "verification.claim.review.lower_roles" };
const now = new Date();
const activeAssignment = (assignment) => assignment.status === "ACTIVE" && (assignment.isOngoing === true || ((!assignment.validFrom || assignment.validFrom <= now) && (!assignment.validUntil || assignment.validUntil >= now)));
const date = (value) => value ? new Date(value).toISOString() : null;
const candidate = ({ assignment, role, user, hasPermission, capability, claimantUserId }) => {
  const reasons = [];
  if (assignment.scopeType !== "SOCIETY") reasons.push("scope is not SOCIETY");
  if (!assignment.societyId) reasons.push("societyId missing");
  if (!activeAssignment(assignment)) reasons.push("assignment is outside active status/window");
  if (role?.status !== "ACTIVE") reasons.push("assigned role is not ACTIVE");
  if (!user || user.status !== "ACTIVE") reasons.push("user is not ACTIVE");
  if (!user?.isLoginAllowed) reasons.push("user loginAllowed is false");
  if (!hasPermission) reasons.push(`role lacks active ALLOW ${capability}`);
  if (String(assignment.userId) === String(claimantUserId)) reasons.push("claimant cannot review own claim");
  return {
    userId: String(assignment.userId), displayName: user?.displayName || null, email: user?.email || null,
    assignedRole: role?.name || null, roleCode: role?.code || null, roleScope: role?.scopeType || null,
    scopeType: assignment.scopeType, scopeId: assignment.societyId ? String(assignment.societyId) : null,
    assignmentStatus: assignment.status, startDate: date(assignment.validFrom), endDate: date(assignment.validUntil),
    ongoing: assignment.isOngoing, academicSession: assignment.academicSession || null,
    userStatus: user?.status || null, loginAllowed: user?.isLoginAllowed ?? null,
    requiredPermission: capability, permissionPresent: hasPermission,
    accepted: reasons.length === 0, reason: reasons.length ? reasons.join("; ") : "accepted",
  };
};

(async () => {
  try {
    await connectDatabase();
    const claims = await Claim.find({ status: "PENDING" }).sort({ createdAt: 1 }).lean();
    const auditedRoleCodes = ["PRESIDENT", "VICE_PRESIDENT", "GENERAL_SECRETARY", "VICE_GENERAL_SECRETARY", "SECRETARY"];
    const auditedRoles = await Role.find({ code: { $in: auditedRoleCodes } }).select("name code scopeType status metadata.reviewTier").lean();
    const auditedMappings = await Mapping.find({ roleId: { $in: auditedRoles.map((role) => role._id) }, isActive: true, effect: "ALLOW" }).select("roleId permissionId").lean();
    const auditedPermissions = await Permission.find({ _id: { $in: auditedMappings.map((mapping) => mapping.permissionId) } }).select("code").lean();
    const auditedPermissionById = new Map(auditedPermissions.map((permission) => [String(permission._id), permission.code]));
    const auditedCapabilitiesByRole = new Map();
    for (const mapping of auditedMappings) {
      const values = auditedCapabilitiesByRole.get(String(mapping.roleId)) || new Set();
      values.add(auditedPermissionById.get(String(mapping.permissionId)));
      auditedCapabilitiesByRole.set(String(mapping.roleId), values);
    }
    const claimResults = [];
    for (const claim of claims) {
      const [society, requestedRole, assignments] = await Promise.all([
        Society.findById(claim.societyId).select("name code").lean(),
        Role.findById(claim.claimedRoleId).select("name code metadata.reviewTier").lean(),
        Assignment.find({ societyId: claim.societyId }).select("userId roleId scopeType societyId status validFrom validUntil isOngoing academicSession").lean(),
      ]);
      const reviewTier = requestedRole?.metadata?.reviewTier || null;
      const primaryCapability = CAPABILITY[reviewTier] || null;
      const roleIds = [...new Set(assignments.map((assignment) => String(assignment.roleId)))];
      const [roles, users, mappings, permissions, leadership] = await Promise.all([
        Role.find({ _id: { $in: roleIds } }).select("name code scopeType status").lean(),
        User.find({ _id: { $in: assignments.map((assignment) => assignment.userId) } }).select("displayName email status isLoginAllowed").lean(),
        Mapping.find({ roleId: { $in: roleIds }, isActive: true, effect: "ALLOW" }).select("roleId permissionId").lean(),
        Permission.find({ code: { $in: Object.values(CAPABILITY) }, status: "ACTIVE" }).select("code").lean(),
        Leadership.find({ societyId: claim.societyId, status: "ACTIVE", isOngoing: true }).select("userId role academicSession").lean(),
      ]);
      const roleById = new Map(roles.map((role) => [String(role._id), role]));
      const userById = new Map(users.map((user) => [String(user._id), user]));
      const permissionById = new Map(permissions.map((permission) => [String(permission._id), permission.code]));
      const permissionsByRole = new Map();
      for (const mapping of mappings) {
        const set = permissionsByRole.get(String(mapping.roleId)) || new Set();
        set.add(permissionById.get(String(mapping.permissionId)));
        permissionsByRole.set(String(mapping.roleId), set);
      }
      const allCandidates = assignments.map((assignment) => candidate({
        assignment, role: roleById.get(String(assignment.roleId)), user: userById.get(String(assignment.userId)),
        hasPermission: Boolean(primaryCapability && permissionsByRole.get(String(assignment.roleId))?.has(primaryCapability)),
        capability: primaryCapability, claimantUserId: claim.userId,
      }));
      const primaryAccepted = allCandidates.filter((item) => item.accepted);
      let fallbackCapability = null, fallbackCandidates = [];
      if (!primaryAccepted.length && reviewTier === "LOWER") {
        fallbackCapability = CAPABILITY.HIGHER;
        fallbackCandidates = assignments.map((assignment) => candidate({
          assignment, role: roleById.get(String(assignment.roleId)), user: userById.get(String(assignment.userId)),
          hasPermission: Boolean(permissionsByRole.get(String(assignment.roleId))?.has(fallbackCapability)),
          capability: fallbackCapability, claimantUserId: claim.userId,
        }));
      }
      claimResults.push({
        claimId: String(claim._id), publicId: claim.publicId || null, society: { name: society?.name || null, societyId: String(claim.societyId) },
        requestedRole: { name: requestedRole?.name || claim.claimedRoleName, code: requestedRole?.code || claim.claimedRoleCode, reviewTier },
        primaryCapability, primaryCandidates: allCandidates, primaryAccepted: primaryAccepted.map((item) => item.userId),
        fallbackCapability, fallbackCandidates, fallbackAccepted: fallbackCandidates.filter((item) => item.accepted).map((item) => item.userId),
        presidentVicePresidentAssignments: allCandidates.filter((item) => ["PRESIDENT", "VICE_PRESIDENT"].includes(item.roleCode)),
        societyLeadershipRecords: leadership.map((item) => ({ userId: String(item.userId || ""), role: item.role, academicSession: item.academicSession || null })),
      });
    }
    const roleCapabilityAudit = auditedRoles.map((role) => ({
      role: role.name, roleCode: role.code, roleScope: role.scopeType, reviewTier: role.metadata?.reviewTier || null,
      higherReviewPermission: auditedCapabilitiesByRole.get(String(role._id))?.has(CAPABILITY.HIGHER) || false,
      lowerReviewPermission: auditedCapabilitiesByRole.get(String(role._id))?.has(CAPABILITY.LOWER) || false,
    }));
    console.log(JSON.stringify({ generatedAt: now.toISOString(), pendingClaimCount: claims.length, roleCapabilityAudit, claims: claimResults }, null, 2));
  } finally {
    await disconnectDatabase();
  }
})().catch((error) => { console.error({ error: error.message, code: error.code }); process.exit(1); });
