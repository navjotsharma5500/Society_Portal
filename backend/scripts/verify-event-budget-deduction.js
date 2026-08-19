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
  SocietyBudget = require("../src/modules/societyBudgets/societyBudget.model"),
  SocietyBudgetTransaction = require("../src/modules/societyBudgets/societyBudgetTransaction.model"),
  service = require("../src/modules/events/event.service"),
  workflow = require("../src/modules/events/eventWorkflow.service"),
  budgets = require("../src/modules/societyBudgets/societyBudget.service"),
  assignments = require("../src/modules/userRoleAssignments/userRoleAssignment.service"),
  academicSessions = require("../src/modules/academicSessions/academicSession.service"),
  reconciliation = require("../src/modules/events/eventBudgetReconciliation.service"),
  { resolveSanctionedBudgetAmount } = require("../src/modules/events/event.constants"),
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

const payload = (societyId, title, date, items = [{ head: "Drone Show", quantity: 1, estimatedUnitCost: 4000 }]) => ({
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

    // --- Pure amount-selection rule ---
    assert.equal(resolveSanctionedBudgetAmount({ totalRecommended: 10000, totalEstimated: 8000 }), 10000, "recommended must win when positive");
    assert.equal(resolveSanctionedBudgetAmount({ totalRecommended: 0, totalEstimated: 8000 }), 8000, "must fall back to estimated when recommended is 0");
    assert.equal(resolveSanctionedBudgetAmount({ totalRecommended: 0, totalEstimated: 0 }), 0, "zero budget must resolve to 0");
    assert.equal(resolveSanctionedBudgetAmount({ totalEstimated: 5000 }), 5000, "missing recommended must fall back to estimated");

    const currentSession = await academicSessions.getCurrentAcademicSession({ required: true });
    const date = eventDates(currentSession);

    const roles = Object.fromEntries(
      (await Role.find({ code: { $in: ["GENERAL_SECRETARY", "PRESIDENT", "ASSISTANT", "DOSA_STAFF", "ADOSA", "DOSA"] } })).map((x) => [x.code, x])
    );
    const stamp = Date.now();
    const society = async (label) => {
      const s = await Society.create({ name: `Budget ${label} ${stamp}`, code: `BD${label.slice(0, 2)}${String(stamp).slice(-6)}`, category: "PROFESSIONAL", status: "ACTIVE", isActive: true });
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

    const dosaStaff = await staff("DoSA-Staff-B", "DOSA_STAFF"),
      adosa = await staff("ADoSA-B", "ADOSA"),
      dosa = await staff("DoSA-B", "DOSA");

    const runToDosaReview = async (soc, presidentUser, gs, title, items, recommendedAmounts) => {
      await enroll(gs.user._id, soc._id, gs.student._id);
      const draft = await service.create({ user: gs.user, student: gs.student, data: payload(soc._id, title, date, items) });
      const evt = await service.submit(gs.user._id, draft._id);
      let review = (await workflow.queue(presidentUser._id, { status: "PENDING" })).items.find((x) => String(x.eventId._id) === String(evt._id));
      await workflow.decide({ userId: presidentUser._id, reviewId: review._id, decision: "APPROVE" });
      // Assistant is removed from Event approval: FACULTY_REVIEW routes straight to DoSA Staff.
      review = (await workflow.queue(dosaStaff._id, { status: "PENDING" })).items.find((x) => String(x.eventId._id) === String(evt._id));
      if (items.length) await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: recommendedAmounts });
      await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" });
      review = (await workflow.queue(adosa._id, { status: "PENDING" })).items.find((x) => String(x.eventId._id) === String(evt._id));
      await workflow.decide({ userId: adosa._id, reviewId: review._id, decision: "APPROVE" });
      review = (await workflow.queue(dosa._id, { status: "PENDING" })).items.find((x) => String(x.eventId._id) === String(evt._id));
      return { event: evt, review };
    };

    // === 1. Successful case: 100,000 allocated, 10,000 sanctioned ===
    const socOk = await society("Success"), presOk = await president(socOk._id, "President-Ok"), gsOk = await student("GS-Ok");
    const budgetOk = await budgets.createAnnualBudget({ societyId: socOk._id, academicSessionId: currentSession._id, allocatedAmount: 100000, remarks: "verify-event-budget-deduction" });
    ids.budgets.push(budgetOk._id);
    const { event: eventOk, review: reviewOk } = await runToDosaReview(socOk, presOk, gsOk, "Success Case", [{ head: "Drone Show", quantity: 1, estimatedUnitCost: 4000 }], [{ recommendedAmount: 10000, reviewRemark: "Approved at 10000" }]);
    const decided = await workflow.decide({ userId: dosa._id, reviewId: reviewOk._id, decision: "APPROVE" });
    assert.equal(decided.event.status, "APPROVED", "event must become APPROVED");
    assert.equal(decided.event.budget.deductionStatus, "POSTED");
    assert.equal(decided.event.budget.deductedAmount, 10000);
    assert(decided.event.budget.budgetTransactionId, "event must store the transaction reference");
    const budgetAfterOk = await budgets.getBudget(budgetOk._id);
    assert.equal(budgetAfterOk.utilizedAmount, 10000, "utilized must increase by the sanctioned amount");
    assert.equal(budgetAfterOk.availableAmount, 90000, "available must decrease by the sanctioned amount");
    const txOk = await SocietyBudgetTransaction.findOne({ referenceType: "EVENT", referenceId: eventOk._id });
    assert(txOk, "an EVENT-linked transaction must exist");
    assert.equal(txOk.amount, 10000);
    assert.equal(String(txOk._id), String(decided.event.budget.budgetTransactionId));

    // === 2. Double-submit case: retrying the already-decided review must not deduct again. The
    // Event is now APPROVED (terminal), so this is refused as EVENT_REVIEW_STALE — the mandatory
    // staleness gate that also protects an APPROVED Event from any old review (see
    // verify-event-workflow.js Test F) — rather than the narrower EVENT_REVIEW_ALREADY_DECIDED.
    await assert.rejects(
      workflow.decide({ userId: dosa._id, reviewId: reviewOk._id, decision: "APPROVE" }),
      (error) => error.code === "EVENT_REVIEW_STALE" && error.statusCode === 409
    );
    assert.equal((await budgets.getBudget(budgetOk._id)).utilizedAmount, 10000, "a retried decision must not deduct twice");
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: eventOk._id }), 1, "exactly one transaction must exist for the event");

    // === 2b. Concurrency: two simultaneous postings for the same reference must yield one deduction ===
    const socRace = await society("Race");
    const budgetRace = await budgets.createAnnualBudget({ societyId: socRace._id, academicSessionId: currentSession._id, allocatedAmount: 5000 });
    ids.budgets.push(budgetRace._id);
    const raceEventId = new mongoose.Types.ObjectId();
    const raceArgs = { societyId: socRace._id, academicSession: currentSession.name, eventId: raceEventId, amount: 1000, reason: "Concurrency check" };
    const [raceA, raceB] = await Promise.all([budgets.utilizeEventBudget(raceArgs), budgets.utilizeEventBudget(raceArgs)]);
    assert.equal([raceA.alreadyPosted, raceB.alreadyPosted].filter((x) => x === false).length, 1, "exactly one concurrent request must perform the deduction");
    assert.equal((await budgets.getBudget(budgetRace._id)).utilizedAmount, 1000, "concurrent retries must not double-deduct");
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: raceEventId }), 1);

    // === 3. Budget failure case: the SocietyBudget disappears between submission and final approval ===
    // (Submission itself now requires a positive available budget — see the Case A/B tests in
    // verify-event-budget-rectification.js — so this scenario provisions a budget up front and then
    // removes it before final approval, to still exercise the "posting fails -> approval must not
    // silently succeed" defensive path at DOSA_REVIEW.)
    const socFail = await society("Fail"), presFail = await president(socFail._id, "President-Fail"), gsFail = await student("GS-Fail");
    const budgetFailProvisional = await budgets.createAnnualBudget({ societyId: socFail._id, academicSessionId: currentSession._id, allocatedAmount: 3000 });
    const { event: eventFail, review: reviewFail } = await runToDosaReview(socFail, presFail, gsFail, "Failure Case", [{ head: "Banner", quantity: 1, estimatedUnitCost: 3000 }], [{ recommendedAmount: 3000, reviewRemark: "Approved" }]);
    await SocietyBudget.deleteOne({ _id: budgetFailProvisional._id });
    await assert.rejects(
      workflow.decide({ userId: dosa._id, reviewId: reviewFail._id, decision: "APPROVE" }),
      (error) => error.code === "EVENT_BUDGET_DEDUCTION_FAILED"
    );
    const eventFailAfter = await Event.findById(eventFail._id).lean();
    assert.equal(eventFailAfter.status, "DOSA_REVIEW", "event must NOT become APPROVED when budget posting fails");
    assert.equal(eventFailAfter.budget.deductionStatus, undefined, "no deduction metadata may be written on failure");
    assert.equal((await Review.findById(reviewFail._id)).status, "PENDING", "the review must remain retryable");
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: eventFail._id }), 0);
    // Retry safely once the budget is configured
    const budgetFail = await budgets.createAnnualBudget({ societyId: socFail._id, academicSessionId: currentSession._id, allocatedAmount: 3000 });
    ids.budgets.push(budgetFail._id);
    const retried = await workflow.decide({ userId: dosa._id, reviewId: reviewFail._id, decision: "APPROVE" });
    assert.equal(retried.event.status, "APPROVED", "the retried approval must succeed once the budget exists");
    assert.equal((await budgets.getBudget(budgetFail._id)).utilizedAmount, 3000);

    // === 4. Zero-budget case: no budget items requested ===
    const socZero = await society("Zero"), presZero = await president(socZero._id, "President-Zero"), gsZero = await student("GS-Zero");
    const budgetZero = await budgets.createAnnualBudget({ societyId: socZero._id, academicSessionId: currentSession._id, allocatedAmount: 5000 });
    ids.budgets.push(budgetZero._id);
    const { event: eventZero, review: reviewZero } = await runToDosaReview(socZero, presZero, gsZero, "Zero Budget Case", [], []);
    const decidedZero = await workflow.decide({ userId: dosa._id, reviewId: reviewZero._id, decision: "APPROVE" });
    assert.equal(decidedZero.event.status, "APPROVED");
    assert.equal(decidedZero.event.budget.deductionStatus, "NOT_REQUIRED");
    assert.equal(decidedZero.event.budget.budgetTransactionId, undefined);
    assert.equal((await budgets.getBudget(budgetZero._id)).utilizedAmount, 0, "a zero-amount event must not post a debit transaction");
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: eventZero._id }), 0);

    // === 5. Historical repair case: an APPROVED event predating this fix, missing its transaction ===
    const gsLegacy = await student("GS-Legacy");
    await enroll(gsLegacy.user._id, socOk._id, gsLegacy.student._id);
    const legacyDraft = await service.create({ user: gsLegacy.user, student: gsLegacy.student, data: payload(socOk._id, "Legacy Pre-Fix Event", date, [{ head: "Catering", quantity: 1, estimatedUnitCost: 8000 }]) });
    await Event.updateOne({ _id: legacyDraft._id }, { $set: { status: "APPROVED", currentStage: "APPROVED", "budget.totalEstimated": 8000 } });

    const report1 = await reconciliation.buildReport();
    const legacyRow = report1.rows.find((row) => row.eventId === String(legacyDraft._id));
    assert(legacyRow, "dry-run report must list the legacy approved event");
    assert.equal(legacyRow.hasTransaction, false);
    assert.equal(legacyRow.sanctionedAmount, 8000);

    const repaired1 = await reconciliation.repairEvent(legacyDraft._id, { actorId: dosa._id });
    assert.equal(repaired1.repaired, true);
    const legacyAfter = await Event.findById(legacyDraft._id).lean();
    assert.equal(legacyAfter.budget.deductionStatus, "POSTED");
    assert.equal(legacyAfter.budget.deductedAmount, 8000);
    assert.equal((await budgets.getBudget(budgetOk._id)).utilizedAmount, 18000, "repair must add to the same budget used by the live flow");
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: legacyDraft._id }), 1);

    const repaired2 = await reconciliation.repairEvent(legacyDraft._id, { actorId: dosa._id });
    assert.equal(repaired2.repaired, false);
    assert.equal(repaired2.reason, "ALREADY_POSTED");
    assert.equal((await budgets.getBudget(budgetOk._id)).utilizedAmount, 18000, "repeating a repair must not deduct twice");
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: legacyDraft._id }), 1);

    const report2 = await reconciliation.buildReport();
    assert(!report2.rows.some((row) => row.eventId === String(legacyDraft._id) && !row.hasTransaction), "reconciled event must no longer be reported as missing");

    console.log(
      JSON.stringify(
        {
          passed: true,
          amountSelectionRule: true,
          successfulDeduction: true,
          doubleSubmitBlocked: true,
          concurrentPostingSafe: true,
          budgetFailureBlocksApproval: true,
          retryAfterFailureSucceeds: true,
          zeroBudgetSkipsTransaction: true,
          historicalDryRunDetects: true,
          historicalRepairIsIdempotent: true,
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
    await SocietyBudgetTransaction.deleteMany({ $or: [{ budgetId: { $in: ids.budgets } }, { societyId: { $in: ids.societies } }] });
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
