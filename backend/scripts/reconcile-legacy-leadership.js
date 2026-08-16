/*
 * Reconciles active legacy SocietyLeadership records into canonical,
 * society-scoped UserRoleAssignments. It intentionally does not create users,
 * alter role definitions, or delete legacy records.
 */
const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const Leadership = require("../src/modules/societyLeadership/societyLeadership.model");
const User = require("../src/modules/users/user.model");
const Role = require("../src/modules/roles/role.model");
const Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model");
const assignmentService = require("../src/modules/userRoleAssignments/userRoleAssignment.service");
const events = require("../src/common/events/domainEvent.service");
const { normalizeEmail } = require("../src/modules/identity/identityNormalization");

const dryRun = process.argv.slice(2).includes("--dry-run");
const unexpectedArgs = process.argv.slice(2).filter((arg) => arg !== "--dry-run");

if (unexpectedArgs.length) {
  console.error(`Unsupported argument(s): ${unexpectedArgs.join(", ")}`);
  process.exit(1);
}

const maskEmail = (email) => {
  const [local, domain] = String(email || "").split("@");
  return domain ? `${local.slice(0, 1) || "*"}***@${domain}` : "(missing)";
};

const isMissingUserId = { $or: [{ userId: null }, { userId: { $exists: false } }] };
const activeLegacyFilter = { status: "ACTIVE", isOngoing: true, ...isMissingUserId };
const scopedAssignmentFilter = ({ userId, roleId, societyId }) => ({
  userId,
  roleId,
  scopeType: "SOCIETY",
  societyId,
  status: "ACTIVE",
  isOngoing: true,
});

const targetedStatus = (item) => ({
  leadershipId: item.leadershipId,
  role: item.role,
  email: maskEmail(item.email),
  outcome: item.outcome,
  reason: item.reason || null,
});

async function reconcile() {
  const report = {
    dryRun,
    examined: 0,
    matched: 0,
    canonicalCreated: 0,
    alreadyCanonical: 0,
    leadershipLinked: 0,
    unmatched: 0,
    conflicts: 0,
    errors: 0,
    details: [],
    societies: {
      MUDRA: [],
      TU_TOASTMASTERS_CLUB: [],
    },
  };

  const records = await Leadership.find(activeLegacyFilter)
    .populate("societyId", "name code")
    .sort({ createdAt: 1 })
    .lean();

  for (const leadership of records) {
    report.examined += 1;
    const result = {
      leadershipId: String(leadership._id),
      societyId: String(leadership.societyId?._id || leadership.societyId),
      societyCode: leadership.societyId?.code || null,
      role: leadership.role,
      email: maskEmail(leadership.email),
      outcome: null,
      reason: null,
    };

    try {
      const email = normalizeEmail(leadership.email);
      if (!email) {
        report.conflicts += 1;
        result.outcome = "CONFLICT";
        result.reason = "LEGACY_EMAIL_INVALID";
        report.details.push(result);
        continue;
      }

      const users = await User.find({ email }).select("_id").lean();
      if (!users.length) {
        report.unmatched += 1;
        result.outcome = "UNMATCHED";
        result.reason = "NO_MATCHING_USER";
        report.details.push(result);
        continue;
      }
      if (users.length !== 1) {
        report.conflicts += 1;
        result.outcome = "CONFLICT";
        result.reason = "MULTIPLE_MATCHING_USERS";
        report.details.push(result);
        continue;
      }

      const roles = await Role.find({ code: String(leadership.role || "").trim().toUpperCase() })
        .select("_id status")
        .lean();
      if (roles.length !== 1 || roles[0].status !== "ACTIVE") {
        report.conflicts += 1;
        result.outcome = "CONFLICT";
        result.reason = roles.length ? "ROLE_NOT_ACTIVE" : "ROLE_NOT_UNIQUELY_MAPPED";
        report.details.push(result);
        continue;
      }

      report.matched += 1;
      const user = users[0], role = roles[0];
      let assignment = await Assignment.findOne(scopedAssignmentFilter({
        userId: user._id,
        roleId: role._id,
        societyId: leadership.societyId?._id || leadership.societyId,
      })).select("_id").lean();

      if (assignment) {
        report.alreadyCanonical += 1;
        result.outcome = "ALREADY_CANONICAL";
      } else if (dryRun) {
        result.outcome = "WOULD_CREATE_CANONICAL";
      } else {
        const created = await assignmentService.createAssignment({
          userId: user._id,
          roleId: role._id,
          scopeType: "SOCIETY",
          societyId: leadership.societyId?._id || leadership.societyId,
          academicSession: leadership.academicSession || null,
          validFrom: leadership.startDate || undefined,
          validUntil: leadership.endDate || undefined,
          isOngoing: leadership.isOngoing,
          status: "ACTIVE",
          assignmentSource: "SYSTEM",
          remarks: "Reconciled from legacy SocietyLeadership",
          metadata: { legacySocietyLeadershipId: String(leadership._id), reconciliation: "LEGACY_LEADERSHIP" },
        });
        assignment = created.entity;
        report.canonicalCreated += 1;
        result.outcome = "CANONICAL_CREATED";
      }

      if (dryRun) {
        result.wouldLinkLeadership = true;
      } else {
        const linked = await Leadership.updateOne(
          { _id: leadership._id, ...isMissingUserId },
          { $set: { userId: user._id } }
        );
        if (linked.modifiedCount === 1) {
          report.leadershipLinked += 1;
          events.publish("SOCIETY_LEADERSHIP_UPDATED", {
            userId: user._id,
            metadata: { societyId: String(leadership.societyId?._id || leadership.societyId), leadershipId: String(leadership._id) },
          });
        } else {
          const current = await Leadership.findById(leadership._id).select("userId").lean();
          if (String(current?.userId || "") !== String(user._id)) {
            throw new Error("LEGACY_LEADERSHIP_LINK_CHANGED_CONCURRENTLY");
          }
        }
      }
      report.details.push(result);
    } catch (error) {
      report.errors += 1;
      result.outcome = "ERROR";
      result.reason = error.code || error.message || "RECONCILIATION_FAILED";
      report.details.push(result);
    }
  }

  for (const item of report.details) {
    const leadership = records.find((record) => String(record._id) === item.leadershipId);
    const name = leadership?.societyId?.name;
    if (name === "Music and Dramatic Society (MUDRA)" && item.role === "PRESIDENT") report.societies.MUDRA.push(targetedStatus(item));
    if (name === "TU Toastmasters Club" && item.role === "PRESIDENT") report.societies.TU_TOASTMASTERS_CLUB.push(targetedStatus(item));
  }
  for (const value of Object.values(report.societies)) {
    if (!value.length) value.push({ outcome: "NO_ACTIVE_UNLINKED_LEGACY_PRESIDENT", reason: null });
  }
  return report;
}

(async () => {
  try {
    await connectDatabase();
    console.log(JSON.stringify(await reconcile(), null, 2));
  } finally {
    await disconnectDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
