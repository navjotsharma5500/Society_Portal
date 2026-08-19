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
  const date = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};

const payload = (societyId, title, date, items) => ({
  societyId,
  title,
  startDate: date,
  endDate: date,
  dailySchedule: [{ date, startTime: "10:00", endTime: "12:00" }],
  objective: "Leadership development",
  annexure: {
    concept: "Speaking and evaluation",
    mode: "OFFLINE",
    targetAudience: "TIET students",
    expectedOutcomes: "Communication skills",
    eventFlow: [{ component: "Speeches", description: "Student speaking session" }],
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
      const s = await Society.create({ name: `Rectify ${label} ${stamp}`, code: `RC${label.slice(0, 2)}${String(stamp).slice(-6)}`, category: "PROFESSIONAL", status: "ACTIVE", isActive: true });
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

    const assistant = await staff("Assistant-R", "ASSISTANT"),
      dosaStaff = await staff("DoSA-Staff-R", "DOSA_STAFF"),
      adosa = await staff("ADoSA-R", "ADOSA"),
      dosa = await staff("DoSA-R", "DOSA");

    const findPending = async (userId, eventId, stage) =>
      (await workflow.queue(userId, { status: "PENDING", stage })).items.find((x) => String(x.eventId._id) === String(eventId));

    // ============ Case A: zero available budget blocks submission ============
    const socZero = await society("Zero"), presZero = await president(socZero._id, "President-Zero"), gsZero = await student("GS-Zero");
    await enroll(gsZero.user._id, socZero._id, gsZero.student._id);
    const draftZero = await service.create({ user: gsZero.user, student: gsZero.student, data: payload(socZero._id, "Zero Budget Society Event", date, [{ head: "Banner", quantity: 1, estimatedUnitCost: 5000 }]) });
    assert.equal(draftZero.status, "DRAFT", "draft save must succeed even with no society budget");
    await assert.rejects(
      service.submit(gsZero.user._id, draftZero._id),
      (error) => {
        assert.equal(error.code, "EVENT_SOCIETY_BUDGET_UNAVAILABLE");
        assert(!/\d/.test(error.message), "the generic message must not leak any numeric balance to the student");
        assert(!/allocat|utili[sz]/i.test(error.message), "the message must not reveal allocation/utilization terminology");
        return true;
      }
    );
    const draftZeroAfter = await Event.findById(draftZero._id).lean();
    assert.equal(draftZeroAfter.status, "DRAFT", "the draft must be preserved, not deleted, after a blocked submission");

    // ============ Case B: requested > available, but available > 0 -> submission proceeds ============
    const socLow = await society("Low"), presLow = await president(socLow._id, "President-Low"), gsLow = await student("GS-Low");
    await enroll(gsLow.user._id, socLow._id, gsLow.student._id);
    const budgetLow = await budgets.createAnnualBudget({ societyId: socLow._id, academicSessionId: currentSession._id, allocatedAmount: 5000 });
    ids.budgets.push(budgetLow._id);
    const draftLow = await service.create({ user: gsLow.user, student: gsLow.student, data: payload(socLow._id, "Low Budget Society Event", date, [{ head: "Drone Show", quantity: 1, estimatedUnitCost: 10000 }]) });
    const submittedLow = await service.submit(gsLow.user._id, draftLow._id);
    assert.equal(submittedLow.status, "FACULTY_REVIEW", "a request exceeding available budget must still be allowed to proceed when available > 0");

    // ============ Main multi-attempt rectification cycle ============
    const socMain = await society("Main"), presMain = await president(socMain._id, "President-Main"), gsMain = await student("GS-Main");
    await enroll(gsMain.user._id, socMain._id, gsMain.student._id);
    const budgetMain = await budgets.createAnnualBudget({ societyId: socMain._id, academicSessionId: currentSession._id, allocatedAmount: 100000 });
    ids.budgets.push(budgetMain._id);

    const draft1 = await service.create({ user: gsMain.user, student: gsMain.student, data: payload(socMain._id, "Toastmasters Showcase", date, [{ head: "Drone Show", quantity: 1, estimatedUnitCost: 10000 }]) });
    let evt = await service.submit(gsMain.user._id, draft1._id);
    assert.equal(evt.status, "FACULTY_REVIEW");
    assert.equal(evt.revision, 1);

    // --- Attempt 1: President -> Assistant -> DoSA Staff (budget position visible, then rectification) ---
    let review = await findPending(presMain._id, evt._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: presMain._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(assistant._id, evt._id, "ASSISTANT_REVIEW");
    await workflow.decide({ userId: assistant._id, reviewId: review._id, decision: "APPROVE" });

    review = await findPending(dosaStaff._id, evt._id, "DOSA_STAFF_REVIEW");
    const dosaDetail1 = await workflow.detail(dosaStaff._id, evt._id);
    assert(dosaDetail1.budgetPosition, "DoSA Staff must see the Society budget position");
    assert.equal(dosaDetail1.budgetPosition.allocatedAmount, 100000);
    assert.equal(dosaDetail1.budgetPosition.availableAmount, 100000);
    assert.equal(dosaDetail1.budgetPosition.requestedAmount, 10000);

    // Existing recommend/edit functionality must still work (not removed).
    await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: [{ recommendedAmount: 9000, reviewRemark: "Trimmed slightly" }] });
    let checked = await Event.findById(evt._id).lean();
    assert.equal(checked.budget.totalRecommended, 9000, "existing recommend/edit functionality must still work");
    assert.equal(checked.budget.totalEstimated, 10000, "estimatedAmount recompute must not corrupt the original requested total");

    // Rectification remark is mandatory.
    await assert.rejects(
      workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "BUDGET_RECTIFICATION" }),
      (error) => error.code === "EVENT_REVIEW_REMARKS_REQUIRED"
    );
    // Wrong stage cannot use this action.
    const badStageReview = await findPending(presLow._id, submittedLow._id, "FACULTY_REVIEW");
    await assert.rejects(
      workflow.decide({ userId: presLow._id, reviewId: badStageReview._id, decision: "BUDGET_RECTIFICATION", remarks: "test" }),
      (error) => error.code === "EVENT_BUDGET_RECTIFICATION_INVALID_STAGE"
    );

    const decided1 = await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "BUDGET_RECTIFICATION", remarks: "The proposed budget is too high. Please revise the budget and resubmit the Event." });
    assert.equal(decided1.event.status, "BUDGET_RECTIFICATION_REQUIRED");
    assert.equal(decided1.event.correctionStage, "DOSA_STAFF_REVIEW");

    // Scope violation: student may not change title/dates/etc. during rectification.
    await assert.rejects(
      service.update(gsMain.user._id, evt._id, { title: "A different title entirely", budget: { items: [{ head: "Drone Show", quantity: 1, estimatedUnitCost: 8000 }] } }),
      (error) => error.code === "EVENT_RECTIFICATION_SCOPE_VIOLATION"
    );
    // Re-sending the SAME date in a different serialization must NOT be treated as a change.
    const currentEvent = await Event.findById(evt._id).lean();
    await service.update(gsMain.user._id, evt._id, {
      startDate: currentEvent.startDate.toISOString().slice(0, 10), // "YYYY-MM-DD" vs stored Date
      endDate: currentEvent.endDate.toISOString().slice(0, 10),
      dailySchedule: currentEvent.dailySchedule.map((row) => ({ ...row, date: new Date(row.date).toISOString().slice(0, 10) })),
      budget: { items: [{ head: "Drone Show", quantity: 1, estimatedUnitCost: 8000 }] },
    });

    // Budget was actually revised: 10000 -> 8000.
    let afterRectify1 = await Event.findById(evt._id).lean();
    assert.equal(afterRectify1.budget.items[0].estimatedUnitCost, 8000);
    assert.equal(afterRectify1.budget.items[0].estimatedAmount, 8000, "estimatedAmount must equal quantity * estimatedUnitCost");
    assert.equal(afterRectify1.budget.totalEstimated, 8000, "totalEstimated must be recalculated, not stale");

    // Human-readable revision history for the student's budget edit.
    let amendmentHistory = await workflow.amendments(evt._id);
    const studentEdit = amendmentHistory.find((x) => x.changedByRoleCode === "STUDENT");
    assert(studentEdit, "the student budget edit must be recorded in amendment history");
    assert(studentEdit.summary.some((line) => /Unit Cost.*10,000.*8,000|10,000 → ₹8,000/.test(line)), `expected a human-readable unit-cost line, got: ${JSON.stringify(studentEdit.summary)}`);
    assert(studentEdit.summary.some((line) => /Total Estimated Budget/.test(line)));
    assert(!JSON.stringify(studentEdit.summary).includes('"items":['), "the summary must not be a raw JSON dump");

    // --- Resubmit: must restart at PRESIDENT, not resume at DoSA Staff ---
    evt = await service.submit(gsMain.user._id, evt._id);
    assert.equal(evt.status, "FACULTY_REVIEW", "resubmission after budget rectification must restart from President");
    assert.equal(evt.revision, 2, "revision/attempt number must increment");
    assert.equal(evt.budget.totalRecommended, 0, "the stale prior recommendation must be cleared for the fresh attempt");

    // The OLD attempt-1 President/Assistant reviews must remain, decided, untouched.
    const attempt1Faculty = await Review.findOne({ eventId: evt._id, stage: "FACULTY_REVIEW", attempt: 1 }).lean();
    assert.equal(attempt1Faculty.status, "APPROVED");
    assert.equal(attempt1Faculty.decidedByUserId.toString(), presMain._id.toString());
    // Old approval must not be reused: a fresh, separate PENDING review must exist for attempt 2.
    const attempt2Faculty = await Review.findOne({ eventId: evt._id, stage: "FACULTY_REVIEW", attempt: 2 }).lean();
    assert(attempt2Faculty, "a new President review must be created for the new attempt");
    assert.equal(attempt2Faculty.status, "PENDING");
    assert.notEqual(String(attempt1Faculty._id), String(attempt2Faculty._id));

    // Only the current attempt has an active pending review for the President.
    const presidentPending = await Review.find({ eventId: evt._id, assignedReviewerUserIds: presMain._id, status: "PENDING" }).lean();
    assert.equal(presidentPending.length, 1, "only one active pending review should exist for the reviewer");
    assert.equal(presidentPending[0].attempt, 2);

    // --- Attempt 2: President -> Assistant -> DoSA Staff rectifies again ---
    review = await findPending(presMain._id, evt._id, "FACULTY_REVIEW");
    assert.equal(review.attempt, 2, "the new President review must belong to attempt 2");
    await workflow.decide({ userId: presMain._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(assistant._id, evt._id, "ASSISTANT_REVIEW");
    await workflow.decide({ userId: assistant._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(dosaStaff._id, evt._id, "DOSA_STAFF_REVIEW");
    const decided2 = await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "BUDGET_RECTIFICATION", remarks: "Still too high for this quarter's allocation." });
    assert.equal(decided2.event.status, "BUDGET_RECTIFICATION_REQUIRED");

    await service.update(gsMain.user._id, evt._id, { budget: { items: [{ head: "Drone Show", quantity: 1, estimatedUnitCost: 6500 }] } });
    evt = await service.submit(gsMain.user._id, evt._id);
    assert.equal(evt.status, "FACULTY_REVIEW");
    assert.equal(evt.revision, 3, "multiple rectification cycles must keep incrementing the attempt number");
    assert.equal(evt.budget.totalEstimated, 6500);

    // --- Attempt 3: President -> Assistant -> DoSA Staff (accepts) -> ADoSA -> DoSA (final approval + deduction) ---
    review = await findPending(presMain._id, evt._id, "FACULTY_REVIEW");
    assert.equal(review.attempt, 3);
    await workflow.decide({ userId: presMain._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(assistant._id, evt._id, "ASSISTANT_REVIEW");
    await workflow.decide({ userId: assistant._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(dosaStaff._id, evt._id, "DOSA_STAFF_REVIEW");
    await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: [{ recommendedAmount: 6500, reviewRemark: "Acceptable" }] });
    await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(adosa._id, evt._id, "ADOSA_REVIEW");
    await workflow.decide({ userId: adosa._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(dosa._id, evt._id, "DOSA_REVIEW");
    const finalDecision = await workflow.decide({ userId: dosa._id, reviewId: review._id, decision: "APPROVE" });
    assert.equal(finalDecision.event.status, "APPROVED");
    assert.equal(finalDecision.event.budget.deductionStatus, "POSTED");
    assert.equal(finalDecision.event.budget.deductedAmount, 6500, "final deduction must use the last accepted amount, not an earlier attempt's figure");

    const finalBudget = await budgets.getBudget(budgetMain._id);
    assert.equal(finalBudget.utilizedAmount, 6500, "the existing final DoSA deduction mechanism must be unchanged and exact");
    assert.equal(finalBudget.reservedAmount, 0, "no reservation logic may be introduced");
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: evt._id }), 1, "exactly one deduction across the whole multi-attempt history");

    // Previous approval history remains intact and readable, tagged by attempt.
    const fullHistory = await workflow.history(evt._id);
    const facultyDecisions = fullHistory.filter((x) => x.stage === "FACULTY_REVIEW");
    assert.equal(facultyDecisions.length, 3, "all three attempts' President reviews must remain in history");
    assert.deepEqual(facultyDecisions.map((x) => x.attempt).sort(), [1, 2, 3]);
    assert(facultyDecisions.every((x) => x.status === "APPROVED"), "each attempt's President review remains individually decided");

    // Human-readable DoSA rectification remarks are preserved for both cycles.
    const rectificationReviews = fullHistory.filter((x) => x.decision === "BUDGET_RECTIFICATION");
    assert.equal(rectificationReviews.length, 2);
    assert.equal(rectificationReviews[0].remarks, "The proposed budget is too high. Please revise the budget and resubmit the Event.");

    // ============ Cancel path (separate small event so the main flow above is untouched) ============
    const gsCancel = await student("GS-Cancel");
    await enroll(gsCancel.user._id, socMain._id, gsCancel.student._id);
    const draftCancel = await service.create({ user: gsCancel.user, student: gsCancel.student, data: payload(socMain._id, "Cancellable Event", date, [{ head: "Catering", quantity: 1, estimatedUnitCost: 3000 }]) });

    // Cannot cancel a plain DRAFT (cancellation is scoped to the rectification flow).
    await assert.rejects(
      service.cancel(gsCancel.user._id, draftCancel._id, "changed my mind"),
      (error) => error.code === "EVENT_NOT_CANCELLABLE"
    );

    let evtCancel = await service.submit(gsCancel.user._id, draftCancel._id);
    let r = await findPending(presMain._id, evtCancel._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: presMain._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(assistant._id, evtCancel._id, "ASSISTANT_REVIEW");
    await workflow.decide({ userId: assistant._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(dosaStaff._id, evtCancel._id, "DOSA_STAFF_REVIEW");
    await workflow.decide({ userId: dosaStaff._id, reviewId: r._id, decision: "BUDGET_RECTIFICATION", remarks: "Please reconsider the catering cost." });

    // Only the creator may cancel.
    await assert.rejects(
      service.cancel(gsMain.user._id, evtCancel._id, "not mine"),
      (error) => error.code === "EVENT_CONTEXT_REQUIRED" || error.code === "EVENT_NOT_CANCELLABLE"
    );

    const cancelled = await service.cancel(gsCancel.user._id, evtCancel._id, "No longer practical this semester.");
    assert.equal(cancelled.status, "CANCELLED");
    const cancelAudit = await Audit.findOne({ eventId: evtCancel._id, action: "EVENT_CANCELLED" }).lean();
    assert(cancelAudit, "cancellation must be recorded in the audit trail");
    assert.equal(cancelAudit.metadata.reason, "No longer practical this semester.");
    const eventStillExists = await Event.findById(evtCancel._id).lean();
    assert(eventStillExists, "the Event record must not be deleted on cancellation");

    // A cancelled Event is terminal: submit() is a no-op and update() is rejected.
    const resubmitAttempt = await service.submit(gsCancel.user._id, evtCancel._id);
    assert.equal(resubmitAttempt.status, "CANCELLED", "a cancelled Event must remain cancelled");
    await assert.rejects(
      service.update(gsCancel.user._id, evtCancel._id, { budget: { items: [{ head: "Catering", quantity: 1, estimatedUnitCost: 1000 }] } }),
      (error) => error.code === "EVENT_NOT_EDITABLE"
    );

    console.log(
      JSON.stringify(
        {
          passed: true,
          draftSaveAllowed: true,
          zeroBudgetBlocksSubmission: true,
          noBalanceLeakedToStudent: true,
          lowBudgetProceedsWhenAvailablePositive: true,
          presidentAssistantApprove: true,
          dosaStaffSeesExactBudgetPosition: true,
          existingRecommendEditPreserved: true,
          rectificationRemarkMandatory: true,
          rectificationOnlyAtDosaStaffStage: true,
          eventReturnsToStudentWithStatus: true,
          budgetOnlyEditScopeEnforced: true,
          serializationOnlyDateChangeIgnored: true,
          derivedBudgetTotalsRecalculated: true,
          humanReadableRevisionHistory: true,
          resubmissionRestartsAtPresident: true,
          oldApprovalNotReused: true,
          onlyOnePendingReviewPerReviewer: true,
          multipleRectificationCyclesWork: true,
          previousApprovalHistoryIntact: true,
          finalApprovalDeductsCorrectAmount: true,
          noReservationLogicIntroduced: true,
          cancelRecordedNotDeleted: true,
          cancelledEventIsTerminal: true,
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
