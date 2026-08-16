const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Role = require("../roles/role.model");
const Assignment = require("../userRoleAssignments/userRoleAssignment.model");
const User = require("../users/user.model");
const Claim = require("../societyClaims/societyClaim.model");
const events = require("../../common/events/domainEvent.service");
const { activeWindow } = require("../userRoleAssignments/userRoleAssignment.service");
const { ROUTE_TYPES } = require("../societyClaims/societyClaim.constants");

const CAPABILITIES = Object.freeze({
  HIGHER: "verification.claim.review.higher_roles",
  LOWER: "verification.claim.review.lower_roles",
});

const tierForRole = (role) => {
  const tier = role?.metadata?.reviewTier;
  if (!Object.hasOwn(CAPABILITIES, tier))
    throw new AppError("Claimed role has no verification review tier", 409, "CLAIM_REVIEW_TIER_UNCONFIGURED");
  return tier;
};

const usersWithSocietyPermission = async ({ societyId, permissionCode, excludeUserId }) => {
  const window = activeWindow(new Date());
  const rows = await Assignment.aggregate([
    { $match: { societyId: new mongoose.Types.ObjectId(String(societyId)), scopeType: "SOCIETY", ...window } },
    { $lookup: { from: "roles", localField: "roleId", foreignField: "_id", as: "role" } },
    { $unwind: "$role" },
    { $match: { "role.status": "ACTIVE" } },
    { $lookup: { from: "rolepermissions", let: { roleId: "$roleId" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$roleId", "$$roleId"] }, { $eq: ["$isActive", true] }, { $eq: ["$effect", "ALLOW"] }] } } },
      { $lookup: { from: "permissions", localField: "permissionId", foreignField: "_id", as: "permission" } },
      { $unwind: "$permission" },
      { $match: { "permission.code": permissionCode, "permission.status": "ACTIVE" } },
    ], as: "permissionMatches" } },
    { $match: { "permissionMatches.0": { $exists: true } } },
    { $group: { _id: "$userId" } },
  ]);
  const ids = rows.map((row) => row._id).filter((id) => !excludeUserId || String(id) !== String(excludeUserId));
  if (!ids.length) return [];
  return (await User.find({ _id: { $in: ids }, status: "ACTIVE", isLoginAllowed: true }).select("_id").lean()).map((user) => user._id);
};

const resolveClaimVerifiers = async ({ societyId, claimedRoleId, claimantUserId }) => {
  const claimed = await Role.findById(claimedRoleId).select("metadata.reviewTier").lean();
  if (!claimed) throw new AppError("Claimed role is invalid", 400, "CLAIM_ROLE_INVALID");
  const reviewTier = tierForRole(claimed);
  let capability = CAPABILITIES[reviewTier], fallbackUsed = false;
  let users = await usersWithSocietyPermission({ societyId, permissionCode: capability, excludeUserId: claimantUserId });
  if (!users.length && reviewTier === "LOWER") {
    capability = CAPABILITIES.HIGHER;
    fallbackUsed = true;
    users = await usersWithSocietyPermission({ societyId, permissionCode: capability, excludeUserId: claimantUserId });
  }
  if (!users.length) throw new AppError("No eligible Society-scoped verifier is available", 409, "VERIFICATION_ROUTE_UNAVAILABLE");
  return {
    routeType: capability === CAPABILITIES.HIGHER ? ROUTE_TYPES.SOCIETY_HIGHER_ROLE_REVIEW : ROUTE_TYPES.SOCIETY_TEAM_REVIEW,
    eligibleVerifierUserIds: users,
    capability,
    reviewTier,
    reason: fallbackUsed ? "NO_LOWER_ROLE_REVIEWER_HIGHER_ROLE_FALLBACK" : `${reviewTier}_ROLE_REVIEW_CAPABILITY`,
    fallbackUsed,
  };
};

const reconcilePendingClaims = async ({ societyIds } = {}) => {
  const match = { status: "PENDING", ...(societyIds?.length ? { societyId: { $in: societyIds } } : {}) };
  const groups = await Claim.aggregate([
    { $match: match },
    { $group: { _id: { societyId: "$societyId", claimedRoleId: "$claimedRoleId", userId: "$userId" }, claimIds: { $push: "$_id" } } },
  ]);
  let examined = 0, changed = 0, unavailable = 0;
  for (const group of groups) {
    examined += group.claimIds.length;
    try {
      const route = await resolveClaimVerifiers({
        societyId: group._id.societyId,
        claimedRoleId: group._id.claimedRoleId,
        claimantUserId: group._id.userId,
      });
      const current = await Claim.find({ _id: { $in: group.claimIds } }).select("verificationTargetUserIds verificationRouteType").lean();
      const targetKey = route.eligibleVerifierUserIds.map(String).sort().join(",");
      const changedIds = current.filter((claim) =>
        claim.verificationRouteType !== route.routeType || claim.verificationTargetUserIds.map(String).sort().join(",") !== targetKey
      ).map((claim) => claim._id);
      if (!changedIds.length) continue;
      await Claim.updateMany({ _id: { $in: changedIds }, status: "PENDING" }, { $set: {
        verificationRouteType: route.routeType,
        verificationTargetUserIds: route.eligibleVerifierUserIds,
        "metadata.routingReason": route.reason,
        "metadata.routingFallbackUsed": route.fallbackUsed,
      } });
      changed += changedIds.length;
      events.publish("SOCIETY_CLAIM_ROUTING_RECONCILED", { metadata: {
        societyId: String(group._id.societyId),
        claimIds: changedIds.map(String),
        verificationTargetUserIds: route.eligibleVerifierUserIds.map(String),
      } });
    } catch (error) {
      if (error.code !== "VERIFICATION_ROUTE_UNAVAILABLE") throw error;
      unavailable += group.claimIds.length;
    }
  }
  return { examined, changed, unavailable };
};

module.exports = { CAPABILITIES, tierForRole, usersWithSocietyPermission, resolveClaimVerifiers, reconcilePendingClaims };
