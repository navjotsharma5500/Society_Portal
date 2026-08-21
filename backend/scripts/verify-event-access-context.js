// Phase 2A verification: Event read-access authorization (Issue 1), the proposal-context endpoint
// (Issue 5), automatic previous-Event resolution + authoritative budgetUsed (Issues 7/8), backend
// protection against client-supplied fake SYSTEM previous-Event history (Issues 9/10), and Student
// Society-scoped Event-list authorization (Issue 4). Does not touch/retest the Phase 1 approval
// routing invariants — see verify-event-workflow.js for those.
process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||= "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||= "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict"),
  mongoose = require("mongoose"),
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
  service = require("../src/modules/events/event.service"),
  workflow = require("../src/modules/events/eventWorkflow.service"),
  assignments = require("../src/modules/userRoleAssignments/userRoleAssignment.service"),
  budgets = require("../src/modules/societyBudgets/societyBudget.service"),
  academicSessions = require("../src/modules/academicSessions/academicSession.service"),
  SocietyBudget = require("../src/modules/societyBudgets/societyBudget.model"),
  SocietyBudgetTransaction = require("../src/modules/societyBudgets/societyBudgetTransaction.model"),
  {
    seedRolePermissionEngine,
  } = require("../src/modules/authorization/rolePermissionEngineSeed.service");
const ids = { users: [], students: [], societies: [], budgets: [] },
  payload = (societyId, title, unitCost = 4000) => ({
    societyId,
    title,
    startDate: "2026-09-10",
    endDate: "2026-09-10",
    dailySchedule: [{ date: "2026-09-10", startTime: "10:00", endTime: "12:00" }],
    objective: "Leadership development",
    annexure: {
      concept: "Speaking and evaluation",
      mode: "OFFLINE",
      targetAudience: "TIET students",
      expectedOutcomes: "Communication skills",
      eventFlow: [{ component: "Speeches", description: "Student speaking session" }],
    },
    budget: { items: [{ head: "Drone Show", quantity: 1, estimatedUnitCost: unitCost }] },
  });
const findPending = async (userId, eventId, stage) => {
  const { items } = await workflow.queue(userId, { status: "PENDING", stage });
  return items.find((x) => String(x.eventId._id) === String(eventId));
};
const approveFullChain = async (event, { presidentUser, dosaStaff, adosa, dosa, recommendedAmount }) => {
  let review = await findPending(presidentUser._id, event._id, "FACULTY_REVIEW");
  await workflow.decide({ userId: presidentUser._id, reviewId: review._id, decision: "APPROVE" });
  review = await findPending(dosaStaff._id, event._id, "DOSA_STAFF_REVIEW");
  await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: [{ recommendedAmount, reviewRemark: "ok" }] });
  await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" });
  review = await findPending(adosa._id, event._id, "ADOSA_REVIEW");
  await workflow.decide({ userId: adosa._id, reviewId: review._id, decision: "APPROVE" });
  review = await findPending(dosa._id, event._id, "DOSA_REVIEW");
  const decided = await workflow.decide({ userId: dosa._id, reviewId: review._id, decision: "APPROVE" });
  return decided.event;
};

(async () => {
  try {
    await db.connectDatabase();
    await seedRolePermissionEngine();
    const stamp = Date.now(),
      roles = Object.fromEntries(
        (
          await Role.find({
            code: { $in: ["GENERAL_SECRETARY", "PRESIDENT", "ASSISTANT", "DOSA_STAFF", "ADOSA", "DOSA"] },
          })
        ).map((x) => [x.code, x])
      ),
      currentSession = await academicSessions.getCurrentAcademicSession({ required: true }),
      societyA = await Society.create({ name: `Access Context A ${stamp}`, code: `ACA${String(stamp).slice(-7)}`, category: "PROFESSIONAL", status: "ACTIVE", isActive: true }),
      societyB = await Society.create({ name: `Access Context B ${stamp}`, code: `ACB${String(stamp).slice(-7)}`, category: "PROFESSIONAL", status: "ACTIVE", isActive: true }),
      societyC = await Society.create({ name: `Access Context C ${stamp}`, code: `ACC${String(stamp).slice(-7)}`, category: "PROFESSIONAL", status: "ACTIVE", isActive: true });
    ids.societies.push(societyA._id, societyB._id, societyC._id);
    const budgetA = await budgets.createAnnualBudget({ societyId: societyA._id, academicSessionId: currentSession._id, allocatedAmount: 100000, remarks: "verify-event-access-context" });
    ids.budgets.push(budgetA._id);
    const student = async (name, societyId) => {
      const s = await Student.create({ name, email: `${name}-${stamp}@test.local`, contactNumber: "9999999999", rollNumber: `${name}${String(stamp).slice(-6)}`, signupStatus: "COMPLETED", profileStatus: "APPROVED" });
      ids.students.push(s._id);
      const u = await User.create({ email: s.email, displayName: name, accountType: "STUDENT", studentMasterId: s._id, status: "ACTIVE", isLoginAllowed: true });
      ids.users.push(u._id);
      const a = (await assignments.createAssignment({ userId: u._id, roleId: roles.GENERAL_SECRETARY._id, scopeType: "SOCIETY", societyId, status: "ACTIVE", isOngoing: true, assignmentSource: "PROFILE_APPROVAL" })).entity;
      await Membership.create({ userId: u._id, studentMasterId: s._id, societyId, roleId: roles.GENERAL_SECRETARY._id, roleCode: "GENERAL_SECRETARY", roleName: "General Secretary", startDate: new Date(), status: "ACTIVE", isOngoing: true, membershipSource: "SYSTEM", linkedUserRoleAssignmentId: a._id });
      return { user: u, student: s };
    };
    const staff = async (name, role, scope = "GLOBAL", societyId = null) => {
      const u = await User.create({ email: `${name}-${stamp}@test.local`, displayName: name, accountType: "FACULTY", status: "ACTIVE", isLoginAllowed: true });
      ids.users.push(u._id);
      await assignments.createAssignment({ userId: u._id, roleId: roles[role]._id, scopeType: scope, societyId: scope === "SOCIETY" ? societyId : null, status: "ACTIVE", isOngoing: true, assignmentSource: "SUPER_ADMIN" });
      return u;
    };
    const gsA = await student("GS-A", societyA._id),
      gsB = await student("GS-B", societyB._id),
      presidentA = await staff("President-A", "PRESIDENT", "SOCIETY", societyA._id),
      assistant = await staff("Assistant-A", "ASSISTANT"),
      dosaStaff = await staff("DoSA-Staff-A", "DOSA_STAFF"),
      adosa = await staff("ADoSA-A", "ADOSA"),
      dosa = await staff("DoSA-A", "DOSA");

    // =============================================================================================
    // TEST 1 — ADoSA read access (Issue 1), including the DRAFT-privacy regression guard.
    // =============================================================================================
    const draftForPrivacy = await service.create({ user: gsA.user, student: gsA.student, data: payload(societyA._id, "Draft Privacy Check") });
    await assert.rejects(
      service.get(adosa._id, draftForPrivacy._id),
      (error) => error.statusCode === 404 && error.code === "EVENT_NOT_FOUND",
      "a GLOBAL reviewer (ADoSA) must NOT see another Student's DRAFT merely from GLOBAL event.view read access"
    );
    const draft1 = await service.create({ user: gsA.user, student: gsA.student, data: payload(societyA._id, "EA-Access-1", 4000) });
    let eventA1 = await service.submit(gsA.user._id, draft1._id);
    const submittedRead = await service.get(adosa._id, eventA1._id);
    assert.equal(String(submittedRead._id), String(eventA1._id), "ADoSA + submitted Event -> 200");
    assert.equal(submittedRead.status, "FACULTY_REVIEW");
    eventA1 = await approveFullChain(eventA1, { presidentUser: presidentA, dosaStaff, adosa, dosa, recommendedAmount: 3500 });
    assert.equal(eventA1.status, "APPROVED");
    const approvedRead = await service.get(adosa._id, eventA1._id);
    assert.equal(approvedRead.status, "APPROVED", "ADoSA + approved Event -> 200");
    const ownSocietyRead = await service.get(gsA.user._id, eventA1._id);
    assert.equal(String(ownSocietyRead._id), String(eventA1._id), "Student own Society -> 200 where allowed");
    await assert.rejects(
      service.get(gsB.user._id, eventA1._id),
      (error) => error.statusCode === 403,
      "Student unrelated Society -> forbidden"
    );
    await assert.rejects(
      service.get(assistant._id, eventA1._id),
      (error) => error.statusCode === 403 || error.statusCode === 404,
      "unauthorized role (Assistant — no Event permissions post Phase 1) -> forbidden"
    );

    // =============================================================================================
    // TEST 2 — proposal-context authorization (Issue 5 / new route).
    // =============================================================================================
    const contextC = await service.proposalContext(gsA.user._id, societyC._id).catch((e) => e);
    assert(contextC instanceof Error, "a Student with no membership/permission in Society C must be denied");
    assert.equal(contextC.statusCode, 403);
    const freshContextC = await (async () => {
      // Re-derive using a member of Society C to prove the "no previous Event" branch works cleanly.
      const gsC = await student("GS-C", societyC._id);
      return { gsC, context: await service.proposalContext(gsC.user._id, societyC._id) };
    })();
    assert.equal(freshContextC.context.previousEvent, null, "a Society with zero APPROVED Events must report previousEvent: null");
    assert.equal(freshContextC.context.facultyPresidents.length, 0, "Society C has no President configured");
    await assert.rejects(
      service.proposalContext(gsA.user._id, societyB._id),
      (error) => error.statusCode === 403,
      "a Student requesting an unauthorized Society's proposal-context must be denied"
    );

    // =============================================================================================
    // TEST 3 — automatic previous-Event resolution + authoritative budgetUsed (Issues 7/8).
    // =============================================================================================
    const contextA = await service.proposalContext(gsA.user._id, societyA._id);
    assert.equal(contextA.facultyPresidents.length, 1);
    assert.equal(contextA.facultyPresidents[0].displayName, "President-A");
    assert(contextA.previousEvent, "Society A now has one APPROVED Event and must surface it");
    assert.equal(String(contextA.previousEvent.sourceEventId), String(eventA1._id));
    assert.equal(contextA.previousEvent.source, "SYSTEM");
    assert.equal(contextA.previousEvent.eventCode, eventA1.eventCode);
    assert.equal(
      contextA.previousEvent.budgetUsed,
      3500,
      "budgetUsed must come from the authoritative final DoSA deduction (deductedAmount), not any client figure"
    );
    // A REJECTED Event must never be selected as the eligible previous Event.
    const draftRejected = await service.create({ user: gsA.user, student: gsA.student, data: payload(societyA._id, "EA-Access-Rejected", 1000) });
    const eventRejected = await service.submit(gsA.user._id, draftRejected._id);
    let rejReview = await findPending(presidentA._id, eventRejected._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: presidentA._id, reviewId: rejReview._id, decision: "APPROVE" });
    rejReview = await findPending(dosaStaff._id, eventRejected._id, "DOSA_STAFF_REVIEW");
    await workflow.decide({ userId: dosaStaff._id, reviewId: rejReview._id, decision: "REJECT", remarks: "Not this quarter." });
    assert.equal((await Event.findById(eventRejected._id)).status, "REJECTED");
    const contextAfterReject = await service.proposalContext(gsA.user._id, societyA._id);
    assert.equal(
      String(contextAfterReject.previousEvent.sourceEventId),
      String(eventA1._id),
      "a REJECTED Event must never be selected as the eligible previous Event — the only APPROVED one must still win"
    );

    // =============================================================================================
    // TEST 4 — backend rejects client-supplied fake SYSTEM previous-Event history (Issues 9/10).
    // =============================================================================================
    const tamperedPayload = payload(societyA._id, "EA-Access-Tamper", 2000);
    tamperedPayload.previousEvents = [
      { source: "SYSTEM", sourceEventId: new mongoose.Types.ObjectId(), eventCode: "EA999999", title: "Fabricated Event", startDate: "2020-01-01", endDate: "2020-01-02", budgetUsed: 99999999 },
      { source: "MANUAL", title: "Legacy pre-portal fest", budgetUsed: 5000 },
    ];
    const tamperedEvent = await service.create({ user: gsA.user, student: gsA.student, data: tamperedPayload });
    const systemRows = tamperedEvent.previousEvents.filter((row) => row.source === "SYSTEM");
    const manualRows = tamperedEvent.previousEvents.filter((row) => row.source === "MANUAL");
    assert.equal(systemRows.length, 1, "exactly one authoritative SYSTEM row must be persisted");
    assert.equal(String(systemRows[0].sourceEventId), String(eventA1._id), "the client-supplied fake sourceEventId must be discarded and replaced with the real one");
    assert.equal(systemRows[0].budgetUsed, 3500, "the client-supplied fake budgetUsed (99999999) must be discarded and replaced with the authoritative amount");
    assert.notEqual(systemRows[0].eventCode, "EA999999");
    assert.equal(manualRows.length, 1, "genuine MANUAL rows supplied by the Student must be retained");
    assert.equal(manualRows[0].title, "Legacy pre-portal fest");
    assert.equal(manualRows[0].budgetUsed, 5000);
    // Tamper again via update(): a different fake SYSTEM row must be discarded, and the ORIGINAL
    // stored SYSTEM snapshot must be reinstated as-is — never silently recomputed on every save.
    const retamperedUpdate = await service.update(gsA.user._id, tamperedEvent._id, {
      ...tamperedPayload,
      previousEvents: [
        { source: "SYSTEM", sourceEventId: new mongoose.Types.ObjectId(), eventCode: "EA000000", title: "Second fabrication", budgetUsed: 1, startDate: "2019-01-01", endDate: "2019-01-02" },
        { source: "MANUAL", title: "Legacy pre-portal fest (edited)", budgetUsed: 6000 },
      ],
    });
    const systemRowsAfterUpdate = retamperedUpdate.previousEvents.filter((row) => row.source === "SYSTEM");
    assert.equal(systemRowsAfterUpdate.length, 1);
    assert.equal(String(systemRowsAfterUpdate[0].sourceEventId), String(eventA1._id), "update() must reinstate the Event's OWN existing SYSTEM row, ignoring any client-supplied SYSTEM row");
    assert.equal(systemRowsAfterUpdate[0].budgetUsed, 3500);
    const manualRowsAfterUpdate = retamperedUpdate.previousEvents.filter((row) => row.source === "MANUAL");
    assert.equal(manualRowsAfterUpdate[0].title, "Legacy pre-portal fest (edited)", "genuine MANUAL edits must still be accepted");

    // =============================================================================================
    // TEST 7 — Student/President Event-list authorization and newest-created-first ordering.
    // =============================================================================================
    const newestDraft = await service.create({
      user: gsA.user,
      student: gsA.student,
      data: payload(societyA._id, "E3 newest-created", 1500),
    });
    const newestEvent = await service.submit(gsA.user._id, newestDraft._id);
    await Event.updateOne({ _id: eventA1._id }, { $set: { startDate: new Date("2026-12-20"), endDate: new Date("2026-12-20") } });
    await Event.updateOne({ _id: eventRejected._id }, { $set: { startDate: new Date("2026-01-20"), endDate: new Date("2026-01-20") } });
    await Event.updateOne({ _id: newestEvent._id }, { $set: { startDate: new Date("2026-06-20"), endDate: new Date("2026-06-20") } });
    const orderedIds = [newestEvent._id, eventRejected._id, eventA1._id].map(String);
    const ownList = await service.list(gsA.user._id, societyA._id, { limit: 50 });
    assert(ownList.items.some((x) => String(x._id) === String(eventA1._id)), "Student valid Society -> 200 and sees their Event");
    assert.deepEqual(
      ownList.items.map((x) => String(x._id)).filter((id) => orderedIds.includes(id)),
      orderedIds,
      "Student Event list must be E3, E2, E1 by createdAt DESC, regardless of scheduled date"
    );
    const presidentList = await service.list(presidentA._id, societyA._id, { limit: 50, excludeDrafts: true });
    assert.deepEqual(
      presidentList.items.map((x) => String(x._id)).filter((id) => orderedIds.includes(id)),
      orderedIds,
      "President Event list must be E3, E2, E1 by createdAt DESC"
    );
    assert(
      presidentList.items.every((x) => x.status !== "DRAFT"),
      "President Event list must continue excluding private drafts"
    );
    await assert.rejects(
      service.list(gsA.user._id, societyB._id, { limit: 50 }),
      (error) => error.statusCode === 403,
      "Student unrelated Society -> 403"
    );

    console.log(
      JSON.stringify(
        {
          passed: true,
          adosaReadsSubmittedEvent: true,
          adosaReadsApprovedEvent: true,
          adosaCannotReadOtherStudentDraft: true,
          studentOwnSocietyReadAllowed: true,
          studentUnrelatedSocietyReadForbidden: true,
          unauthorizedRoleForbidden: true,
          proposalContextAuthorizationEnforced: true,
          proposalContextNoPreviousEventWhenNoneExists: true,
          proposalContextResolvesLatestApproved: true,
          rejectedEventNeverSelectedAsPrevious: true,
          budgetUsedIsBackendAuthoritative: true,
          fakeSystemRowDiscardedOnCreate: true,
          manualRowsRetainedOnCreate: true,
          fakeSystemRowDiscardedOnUpdate: true,
          originalSystemRowReinstatedOnUpdate: true,
          manualEditsAcceptedOnUpdate: true,
          studentEventListValidSociety200: true,
          studentEventListUnrelatedSociety403: true,
          studentEventListNewestFirst: true,
          presidentEventListNewestFirst: true,
          presidentPrivateDraftsExcluded: true,
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
