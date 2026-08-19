process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||= "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||= "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict"),
  db = require("../src/config/database"),
  User = require("../src/modules/users/user.model"),
  Student = require("../src/modules/studentMaster/studentMaster.model"),
  Society = require("../src/modules/societies/society.model"),
  Role = require("../src/modules/roles/role.model"),
  Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model"),
  Membership = require("../src/modules/societyMemberships/societyMembership.model"),
  Event = require("../src/modules/events/event.model"),
  Review = require("../src/modules/events/eventReview.model"),
  Audit = require("../src/modules/events/eventAudit.model"),
  service = require("../src/modules/events/event.service"),
  workflow = require("../src/modules/events/eventWorkflow.service"),
  authz = require("../src/modules/authorization/authorization.service"),
  assignments = require("../src/modules/userRoleAssignments/userRoleAssignment.service"),
  {
    seedRolePermissionEngine,
  } = require("../src/modules/authorization/rolePermissionEngineSeed.service");

const ids = { users: [], students: [], societies: [] };

(async () => {
  try {
    await db.connectDatabase();
    await seedRolePermissionEngine();

    const roles = Object.fromEntries(
      (await Role.find({ code: { $in: ["GENERAL_SECRETARY", "PRESIDENT"] } })).map((x) => [x.code, x])
    );
    const stamp = Date.now();
    const society = await Society.create({ name: `SA Access ${stamp}`, code: `SA${String(stamp).slice(-8)}`, category: "PROFESSIONAL", status: "ACTIVE", isActive: true });
    ids.societies.push(society._id);

    const student = async (name) => {
      const s = await Student.create({ name, email: `${name}-${stamp}@test.local`, contactNumber: "9999999999", rollNumber: `${name}${String(stamp).slice(-6)}`, signupStatus: "COMPLETED", profileStatus: "APPROVED" });
      ids.students.push(s._id);
      const u = await User.create({ email: s.email, displayName: name, accountType: "STUDENT", studentMasterId: s._id, status: "ACTIVE", isLoginAllowed: true });
      ids.users.push(u._id);
      return { user: u, student: s };
    };
    const gs = await student("GS-SA-Access");
    const gsAssignment = (await assignments.createAssignment({ userId: gs.user._id, roleId: roles.GENERAL_SECRETARY._id, scopeType: "SOCIETY", societyId: society._id, status: "ACTIVE", isOngoing: true, assignmentSource: "PROFILE_APPROVAL" })).entity;
    await Membership.create({ userId: gs.user._id, studentMasterId: gs.student._id, societyId: society._id, roleId: roles.GENERAL_SECRETARY._id, roleCode: "GENERAL_SECRETARY", roleName: "General Secretary", startDate: new Date(), status: "ACTIVE", isOngoing: true, membershipSource: "SYSTEM", linkedUserRoleAssignmentId: gsAssignment._id });

    const president = await User.create({ email: `President-SA-${stamp}@test.local`, displayName: "President-SA", accountType: "FACULTY", status: "ACTIVE", isLoginAllowed: true });
    ids.users.push(president._id);
    await assignments.createAssignment({ userId: president._id, roleId: roles.PRESIDENT._id, scopeType: "SOCIETY", societyId: society._id, status: "ACTIVE", isOngoing: true, assignmentSource: "SUPER_ADMIN" });

    // An ordinary user with no membership in this society and no reviewer assignment
    const outsider = await student("Outsider-SA");

    // SUPER_ADMIN is a protected role: createAssignment() refuses to grant it to anyone (even a
    // whitelisted email) outside the dedicated bootstrap flow. Reusing the real, already-bootstrapped
    // Super Admin account is the only legitimate way to exercise this path without weakening that guard.
    const superAdmin = await User.findOne({ email: "navjot.sharma@thapar.edu", accountType: "SUPER_ADMIN" }).select("_id").lean();
    if (!superAdmin)
      throw new Error("No bootstrapped SUPER_ADMIN account found (expected navjot.sharma@thapar.edu) — cannot verify this fix in this environment.");

    const draft = await service.create({ user: gs.user, student: gs.student, data: {
      societyId: society._id,
      title: "SA Access Case",
      startDate: null,
      endDate: null,
      budget: { items: [{ head: "Banner", quantity: 1, estimatedUnitCost: 1500 }] },
    } });
    const event = await Event.findById(draft._id);
    // Force past DRAFT into an in-flight workflow stage without needing full date/schedule validation plumbing.
    event.status = "FACULTY_REVIEW";
    event.currentStage = "FACULTY_REVIEW";
    event.submittedAt = new Date();
    event.submittedByUserId = gs.user._id;
    await event.save();
    await workflow.assign(event, "FACULTY_REVIEW", event.revision, [{ _id: president._id }]);

    // === 1. Super Admin can list Events (matches the requirePermission("event.view") route gate) ===
    assert.equal((await authz.hasPermission({ userId: superAdmin._id, permissionCode: "event.view" })).allowed, true, "Super Admin must be allowed to list events");

    // === 2/3/4. Super Admin can open the event; full detail incl. budget + approval history; no membership required ===
    const membershipCheck = await Membership.findOne({ userId: superAdmin._id, societyId: society._id });
    assert.equal(membershipCheck, null, "test setup sanity: Super Admin must have no membership in this society");
    const seenBySuperAdmin = await service.get(superAdmin._id, event._id);
    assert.equal(seenBySuperAdmin.eventCode, event.eventCode);
    assert(seenBySuperAdmin.budget, "response must include budget");
    assert.equal(seenBySuperAdmin.budget.totalEstimated, 1500);
    assert(Array.isArray(seenBySuperAdmin.reviewHistory), "response must include approval/review history");

    // === 6. Normal society member access still works ===
    const seenByMember = await service.get(gs.user._id, event._id);
    assert.equal(seenByMember.eventCode, event.eventCode);

    // === 7. Unrelated ordinary user without membership/reviewer permission still receives 403 EVENT_CONTEXT_REQUIRED ===
    await assert.rejects(
      service.get(outsider.user._id, event._id),
      (error) => error.statusCode === 403 && error.code === "EVENT_CONTEXT_REQUIRED"
    );

    // === 8. Assigned Event reviewers retain their existing access (separate review-detail path, untouched) ===
    const reviewDetail = await workflow.detail(president._id, event._id);
    assert.equal(String(reviewDetail._id), String(event._id));

    // === 9/10. Super Admin gains no approve/reject workflow role; routing unchanged ===
    assert(!Object.prototype.hasOwnProperty.call(workflow.routing, "SUPER_ADMIN"), "SUPER_ADMIN must not appear in the approval routing table");
    assert.deepEqual(Object.keys(workflow.routing), ["FACULTY_REVIEW", "DOSA_STAFF_REVIEW", "ADOSA_REVIEW", "DOSA_REVIEW"]);
    const pendingReview = await Review.findOne({ eventId: event._id, stage: "FACULTY_REVIEW" });
    await assert.rejects(
      workflow.decide({ userId: superAdmin._id, reviewId: pendingReview._id, decision: "APPROVE" }),
      (error) => error.code === "EVENT_REVIEW_FORBIDDEN"
    );

    // === Direct check against the exact event named in the bug report (read-only) ===
    const realEventId = "6a81583ea84b9486a2a2860f";
    let realEventResult = "SKIPPED (fixture data not present in this environment)";
    if (await Event.exists({ _id: realEventId })) {
      const opened = await service.get(superAdmin._id, realEventId);
      assert.equal(String(opened._id), realEventId);
      realEventResult = { eventCode: opened.eventCode, status: opened.status, hasBudget: Boolean(opened.budget), reviewHistoryCount: opened.reviewHistory?.length ?? 0 };
    }

    console.log(
      JSON.stringify(
        {
          passed: true,
          superAdminCanList: true,
          superAdminCanOpenAnyEvent: true,
          fullDetailIncludesBudgetAndHistory: true,
          noMembershipRequiredForSuperAdmin: true,
          normalMemberAccessUnaffected: true,
          unrelatedUserStillForbidden: true,
          assignedReviewerAccessUnaffected: true,
          superAdminNotAddedToWorkflow: true,
          routingUnchanged: true,
          realEventCheck: realEventResult,
        },
        null,
        2
      )
    );
  } finally {
    const eventIds = await Event.find({ createdByUserId: { $in: ids.users } }).distinct("_id");
    await Review.deleteMany({ eventId: { $in: eventIds } });
    await Audit.deleteMany({ eventId: { $in: eventIds } });
    await Event.deleteMany({ _id: { $in: eventIds } });
    await Membership.deleteMany({ userId: { $in: ids.users } });
    await Assignment.deleteMany({ userId: { $in: ids.users } });
    await User.deleteMany({ _id: { $in: ids.users } });
    await Student.deleteMany({ _id: { $in: ids.students } });
    await Society.deleteMany({ _id: { $in: ids.societies } });
    await db.disconnectDatabase();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
