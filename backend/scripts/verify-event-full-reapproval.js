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
  Amendment = require("../src/modules/events/eventAmendment.model"),
  Audit = require("../src/modules/events/eventAudit.model"),
  SocietyBudget = require("../src/modules/societyBudgets/societyBudget.model"),
  SocietyBudgetTransaction = require("../src/modules/societyBudgets/societyBudgetTransaction.model"),
  service = require("../src/modules/events/event.service"),
  workflow = require("../src/modules/events/eventWorkflow.service"),
  budgets = require("../src/modules/societyBudgets/societyBudget.service"),
  authz = require("../src/modules/authorization/authorization.service"),
  assignments = require("../src/modules/userRoleAssignments/userRoleAssignment.service"),
  academicSessions = require("../src/modules/academicSessions/academicSession.service"),
  {
    seedRolePermissionEngine,
  } = require("../src/modules/authorization/rolePermissionEngineSeed.service");

const ids = { users: [], students: [], societies: [], budgets: [] };

const eventDates = (session) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sessionStart = new Date(session.startDate);
  const base = sessionStart > today ? sessionStart : today;
  const d = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

const payload = (societyId, title, date, items) => ({
  societyId,
  title,
  startDate: date,
  endDate: date,
  dailySchedule: [{ date, startTime: "10:00", endTime: "12:00" }],
  objective: "Annual showcase",
  annexure: {
    concept: "Flagship society event",
    mode: "OFFLINE",
    targetAudience: "TIET students",
    expectedOutcomes: "Visibility and engagement",
    eventFlow: [{ component: "Main event", description: "Core programme" }],
  },
  budget: { items },
});

(async () => {
  try {
    await db.connectDatabase();
    await seedRolePermissionEngine();
    const currentSession = await academicSessions.getCurrentAcademicSession({ required: true });
    const date = eventDates(currentSession);
    const stamp = Date.now();

    const roles = Object.fromEntries(
      (await Role.find({ code: { $in: ["GENERAL_SECRETARY", "PRESIDENT", "ASSISTANT", "DOSA_STAFF", "ADOSA", "DOSA"] } })).map((x) => [x.code, x])
    );
    const society = async (label) => {
      const s = await Society.create({ name: `Reapproval ${label} ${stamp}`, code: `RA${label.slice(0, 2)}${String(stamp).slice(-6)}`, category: "PROFESSIONAL", status: "ACTIVE", isActive: true });
      ids.societies.push(s._id);
      return s;
    };
    const student = async (name) => {
      const s = await Student.create({ name, email: `${name}-${stamp}@test.local`, contactNumber: "9999999999", rollNumber: `${name}${String(stamp).slice(-6)}`, signupStatus: "COMPLETED", profileStatus: "APPROVED" });
      ids.students.push(s._id);
      const u = await User.create({ email: s.email, displayName: name, accountType: "STUDENT", studentMasterId: s._id, status: "ACTIVE", isLoginAllowed: true });
      ids.users.push(u._id);
      return { user: u, student: s };
    };
    const enroll = async (userId, societyId, studentMasterId) => {
      const a = (await assignments.createAssignment({ userId, roleId: roles.GENERAL_SECRETARY._id, scopeType: "SOCIETY", societyId, status: "ACTIVE", isOngoing: true, assignmentSource: "PROFILE_APPROVAL" })).entity;
      await Membership.create({ userId, studentMasterId, societyId, roleId: roles.GENERAL_SECRETARY._id, roleCode: "GENERAL_SECRETARY", roleName: "General Secretary", startDate: new Date(), status: "ACTIVE", isOngoing: true, membershipSource: "SYSTEM", linkedUserRoleAssignmentId: a._id });
    };
    const president = async (societyId, name) => {
      const u = await User.create({ email: `${name}-${stamp}@test.local`, displayName: name, accountType: "FACULTY", status: "ACTIVE", isLoginAllowed: true });
      ids.users.push(u._id);
      await assignments.createAssignment({ userId: u._id, roleId: roles.PRESIDENT._id, scopeType: "SOCIETY", societyId, status: "ACTIVE", isOngoing: true, assignmentSource: "SUPER_ADMIN" });
      return u;
    };
    const staff = async (name, role) => {
      const u = await User.create({ email: `${name}-${stamp}@test.local`, displayName: name, accountType: "FACULTY", status: "ACTIVE", isLoginAllowed: true });
      ids.users.push(u._id);
      await assignments.createAssignment({ userId: u._id, roleId: roles[role]._id, scopeType: "GLOBAL", societyId: null, status: "ACTIVE", isOngoing: true, assignmentSource: "SUPER_ADMIN" });
      return u;
    };
    const assistant = await staff("Assistant-F", "ASSISTANT"),
      dosaStaff = await staff("DoSA-Staff-F", "DOSA_STAFF"),
      adosa = await staff("ADoSA-F", "ADOSA"),
      dosa = await staff("DoSA-F", "DOSA");
    const findPending = async (userId, eventId, stage) =>
      (await workflow.queue(userId, { status: "PENDING", stage })).items.find((x) => String(x.eventId._id) === String(eventId));
    const runToStage = async (soc, presidentUser, gs, title, targetStage) => {
      await enroll(gs.user._id, soc._id, gs.student._id);
      const draft = await service.create({ user: gs.user, student: gs.student, data: payload(soc._id, title, date, [{ head: "Banner", quantity: 1, estimatedUnitCost: 2000 }]) });
      let evt = await service.submit(gs.user._id, draft._id);
      let review = await findPending(presidentUser._id, evt._id, "FACULTY_REVIEW");
      await workflow.decide({ userId: presidentUser._id, reviewId: review._id, decision: "APPROVE" });
      if (targetStage === "FACULTY_REVIEW") return { evt };
      review = await findPending(assistant._id, evt._id, "ASSISTANT_REVIEW");
      await workflow.decide({ userId: assistant._id, reviewId: review._id, decision: "APPROVE" });
      if (targetStage === "ASSISTANT_REVIEW") return { evt };
      review = await findPending(dosaStaff._id, evt._id, "DOSA_STAFF_REVIEW");
      if (targetStage === "DOSA_STAFF_REVIEW") return { evt, review };
      await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: [{ recommendedAmount: 1800, reviewRemark: "Trimmed" }] });
      await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" });
      if (targetStage === "ADOSA_REVIEW") return { evt };
      review = await findPending(adosa._id, evt._id, "ADOSA_REVIEW");
      await workflow.decide({ userId: adosa._id, reviewId: review._id, decision: "APPROVE" });
      return { evt };
    };

    const fundSociety = async (soc) => {
      const b = await budgets.createAnnualBudget({ societyId: soc._id, academicSessionId: currentSession._id, allocatedAmount: 100000 });
      ids.budgets.push(b._id);
      return b;
    };

    // ============ Scenario B: DOSA generic Request Changes at DOSA_REVIEW ============
    const socB = await society("B"), presB = await president(socB._id, "President-B"), gsB = await student("GS-B");
    await fundSociety(socB);
    let { evt: evtB } = await runToStage(socB, presB, gsB, "Scenario B Event", "DOSA_REVIEW");
    let review = await findPending(dosa._id, evtB._id, "DOSA_REVIEW");
    assert(review, "Event must reach DOSA_REVIEW");
    const dosaRequestChanges = await workflow.decide({ userId: dosa._id, reviewId: review._id, decision: "REQUEST_CHANGES", remarks: "Please revise the event details and resubmit." });
    assert.equal(dosaRequestChanges.event.status, "CHANGES_REQUESTED");
    assert.equal(dosaRequestChanges.event.correctionStage, "DOSA_REVIEW");
    const revisionB = dosaRequestChanges.event.revision;
    await service.update(gsB.user._id, evtB._id, { objective: "Revised objective after DoSA feedback" });
    let resubmittedB = await service.submit(gsB.user._id, evtB._id);
    assert.equal(resubmittedB.status, "FACULTY_REVIEW", "resubmission after DOSA Request Changes must restart at FACULTY_REVIEW");
    assert.equal(resubmittedB.revision, revisionB + 1);
    assert.equal(resubmittedB.budget.totalRecommended, 0, "stale DoSA Staff recommendation must be cleared on the new attempt");
    let freshReview = await findPending(presB._id, evtB._id, "FACULTY_REVIEW");
    assert(freshReview, "a fresh President review must exist for the new attempt");
    assert.equal(freshReview.attempt, resubmittedB.revision);
    // Old attempt-1 reviews remain, decided, as history — not reused.
    const oldDosaReview = await Review.findById(review._id).lean();
    assert.equal(oldDosaReview.status, "CHANGES_REQUESTED");
    assert.equal(oldDosaReview.decision, "REQUEST_CHANGES");
    assert.equal(await Review.countDocuments({ eventId: evtB._id, status: "PENDING" }), 1, "only one active pending review may exist");
    // Finish attempt 2 through to final approval (normal full path must still work end-to-end).
    await workflow.decide({ userId: presB._id, reviewId: freshReview._id, decision: "APPROVE" });
    let r = await findPending(assistant._id, evtB._id, "ASSISTANT_REVIEW");
    await workflow.decide({ userId: assistant._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(dosaStaff._id, evtB._id, "DOSA_STAFF_REVIEW");
    assert.equal((await Event.findById(evtB._id)).budget.items[0].recommendedAmount, undefined, "DoSA Staff must review the budget again on the fresh attempt");
    await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: r._id, items: [{ recommendedAmount: 1800, reviewRemark: "Trimmed again" }] });
    await workflow.decide({ userId: dosaStaff._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(adosa._id, evtB._id, "ADOSA_REVIEW");
    await workflow.decide({ userId: adosa._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(dosa._id, evtB._id, "DOSA_REVIEW");
    const finalB = await workflow.decide({ userId: dosa._id, reviewId: r._id, decision: "APPROVE" });
    assert.equal(finalB.event.status, "APPROVED");
    assert.equal(finalB.event.budget.deductionStatus, "POSTED");
    assert.equal(finalB.event.budget.deductedAmount, 1800);
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: evtB._id }), 1);
    const historyB = await workflow.history(evtB._id);
    assert.equal(historyB.filter((x) => x.stage === "FACULTY_REVIEW").length, 2, "both President review attempts must remain in history");

    // ============ Scenario C: ADoSA Request Changes at ADOSA_REVIEW ============
    const socC = await society("C"), presC = await president(socC._id, "President-C"), gsC = await student("GS-C");
    await fundSociety(socC);
    let { evt: evtC } = await runToStage(socC, presC, gsC, "Scenario C Event", "ADOSA_REVIEW");
    review = await findPending(adosa._id, evtC._id, "ADOSA_REVIEW");
    assert(review, "Event must reach ADOSA_REVIEW");
    const adosaRequestChanges = await workflow.decide({ userId: adosa._id, reviewId: review._id, decision: "REQUEST_CHANGES", remarks: "Please clarify the venue arrangement." });
    assert.equal(adosaRequestChanges.event.status, "CHANGES_REQUESTED");
    assert.equal(adosaRequestChanges.event.correctionStage, "ADOSA_REVIEW");
    await service.update(gsC.user._id, evtC._id, { objective: "Revised objective after ADoSA feedback" });
    let resubmittedC = await service.submit(gsC.user._id, evtC._id);
    assert.equal(resubmittedC.status, "FACULTY_REVIEW", "resubmission after ADoSA Request Changes must restart at FACULTY_REVIEW");
    assert.equal(await Review.countDocuments({ eventId: evtC._id, stage: "ADOSA_REVIEW", attempt: resubmittedC.revision }), 0, "no premature ADoSA review for the new attempt");
    // Full chain again, ending APPROVED.
    r = await findPending(presC._id, evtC._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: presC._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(assistant._id, evtC._id, "ASSISTANT_REVIEW");
    await workflow.decide({ userId: assistant._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(dosaStaff._id, evtC._id, "DOSA_STAFF_REVIEW");
    await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: r._id, items: [{ recommendedAmount: 1900, reviewRemark: "OK" }] });
    await workflow.decide({ userId: dosaStaff._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(adosa._id, evtC._id, "ADOSA_REVIEW");
    await workflow.decide({ userId: adosa._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(dosa._id, evtC._id, "DOSA_REVIEW");
    const finalC = await workflow.decide({ userId: dosa._id, reviewId: r._id, decision: "APPROVE" });
    assert.equal(finalC.event.status, "APPROVED", "normal full approval must still end PRESIDENT -> ... -> APPROVED");

    // ============ DoSA Staff generic Request Changes (distinct from Budget Rectification) ============
    const socD = await society("D"), presD = await president(socD._id, "President-D"), gsD = await student("GS-D");
    await fundSociety(socD);
    let { evt: evtD, review: dosaStaffReviewD } = await runToStage(socD, presD, gsD, "Scenario D Event", "DOSA_STAFF_REVIEW");
    const dosaStaffRequestChanges = await workflow.decide({ userId: dosaStaff._id, reviewId: dosaStaffReviewD._id, decision: "REQUEST_CHANGES", remarks: "Please add more Event Flow detail before we review budget." });
    assert.equal(dosaStaffRequestChanges.event.status, "CHANGES_REQUESTED", "DoSA Staff generic Request Changes must return the Event to the Student");
    assert.equal(dosaStaffRequestChanges.event.correctionStage, "DOSA_STAFF_REVIEW");
    await service.update(gsD.user._id, evtD._id, { objective: "Revised objective after DoSA Staff feedback" });
    let resubmittedD = await service.submit(gsD.user._id, evtD._id);
    assert.equal(resubmittedD.status, "FACULTY_REVIEW", "resubmission after DoSA Staff Request Changes must restart at FACULTY_REVIEW, not resume at DOSA_STAFF_REVIEW");
    assert(await findPending(presD._id, evtD._id, "FACULTY_REVIEW"), "a fresh President review must be required");

    // ============ live-request-usage: root cause + fix proof ============
    // Root cause: the route used to gate on requirePermission("event.view") without a societyId,
    // which only matches GLOBAL-scoped assignments -- a GENERAL_SECRETARY's grant is SOCIETY-scoped
    // and would never match, producing a 403 for the student's own usage endpoint.
    const rootCauseCheck = await authz.hasPermission({ userId: gsD.user._id, permissionCode: "event.view" });
    assert.equal(rootCauseCheck.allowed, false, "sanity: a society-scoped GS grant must not satisfy a societyId-less permission check (this was the bug)");
    // The fix removes that gate; the service itself is inherently self-scoped to the caller's userId.
    const usage = await service.liveRequestUsage(gsD.user._id, undefined);
    assert(Number.isFinite(usage.limit) && Number.isFinite(usage.current), "the Event creator's own usage must be computable with no extra permission");
    assert.equal(typeof usage.available, "boolean");

    // ============ Unauthorized access to protected Event data must still be denied ============
    const outsider = await student("GS-Outsider-F");
    await assert.rejects(
      workflow.detail(outsider.user._id, evtB._id),
      (error) => error.statusCode === 403
    );
    await assert.rejects(
      service.get(outsider.user._id, evtD._id),
      (error) => error.statusCode === 403 || error.statusCode === 404
    );

    // ============ No reservation logic; Admin remains outside ============
    const finalBudgetB = await budgets.getBudget((await SocietyBudget.findOne({ societyId: socB._id }))._id);
    assert.equal(finalBudgetB.reservedAmount, 0);
    assert(!Object.prototype.hasOwnProperty.call(workflow.routing, "ADMIN_REVIEW"));
    assert(!Object.prototype.hasOwnProperty.call(workflow.routing, "SUPER_ADMIN"));

    console.log(
      JSON.stringify(
        {
          passed: true,
          dosaRequestChangesReturnsToStudent: true,
          adosaRequestChangesReturnsToStudent: true,
          dosaStaffGenericRequestChangesReturnsToStudent: true,
          everyResubmissionRestartsAtFacultyReview: true,
          oldApprovalsNotReused: true,
          onlyOnePendingReviewPerAttempt: true,
          previousAttemptsRemainHistory: true,
          staleDosaStaffRecommendationCleared: true,
          normalFullApprovalStillEndsApproved: true,
          finalDeductionUnaffected: true,
          liveRequestUsageRootCauseConfirmed: true,
          liveRequestUsageWorksForOwnAccount: true,
          unauthorizedAccessStillDenied: true,
          noReservationLogicIntroduced: true,
          adminOutsideWorkflow: true,
        },
        null,
        2
      )
    );
  } finally {
    const eventIds = await Event.find({ createdByUserId: { $in: ids.users } }).distinct("_id");
    await Review.deleteMany({ eventId: { $in: eventIds } });
    await Amendment.deleteMany({ eventId: { $in: eventIds } });
    await Audit.deleteMany({ eventId: { $in: eventIds } });
    await Event.deleteMany({ _id: { $in: eventIds } });
    await SocietyBudgetTransaction.deleteMany({ budgetId: { $in: ids.budgets } });
    await SocietyBudget.deleteMany({ _id: { $in: ids.budgets } });
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
