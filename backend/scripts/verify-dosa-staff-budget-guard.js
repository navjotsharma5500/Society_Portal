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
      const s = await Society.create({ name: `Guard ${label} ${stamp}`, code: `GD${label.slice(0, 2)}${String(stamp).slice(-6)}`, category: "PROFESSIONAL", status: "ACTIVE", isActive: true });
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
    const assistant = await staff("Assistant-G", "ASSISTANT"),
      dosaStaff = await staff("DoSA-Staff-G", "DOSA_STAFF"),
      adosa = await staff("ADoSA-G", "ADOSA"),
      dosa = await staff("DoSA-G", "DOSA");
    const findPending = async (userId, eventId, stage) =>
      (await workflow.queue(userId, { status: "PENDING", stage })).items.find((x) => String(x.eventId._id) === String(eventId));

    // ============ Main scenario: ₹4,00,000 requested vs ₹3,92,000 available ============
    const soc = await society("Main"), pres = await president(soc._id, "President-G"), gs = await student("GS-Guard");
    await enroll(gs.user._id, soc._id, gs.student._id);
    const budget = await budgets.createAnnualBudget({ societyId: soc._id, academicSessionId: currentSession._id, allocatedAmount: 400000 });
    ids.budgets.push(budget._id);
    // Simulate 8,000 already utilized by a prior Event, so available = 392,000.
    await budgets.utilizeEventBudget({ societyId: soc._id, academicSession: currentSession.name, eventId: new mongoose.Types.ObjectId(), amount: 8000, reason: "Prior utilization (test fixture)" });

    // 1. Student submits Event (Case B: requested > available, but available > 0 -> still allowed)
    const draft = await service.create({ user: gs.user, student: gs.student, data: payload(soc._id, "Flagship Showcase", date, [{ head: "Drone Show", quantity: 1, estimatedUnitCost: 400000 }]) });
    let evt = await service.submit(gs.user._id, draft._id);
    assert.equal(evt.status, "FACULTY_REVIEW");

    // 2. President approves
    let review = await findPending(pres._id, evt._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: pres._id, reviewId: review._id, decision: "APPROVE" });
    // 3. Assistant approves
    review = await findPending(assistant._id, evt._id, "ASSISTANT_REVIEW");
    await workflow.decide({ userId: assistant._id, reviewId: review._id, decision: "APPROVE" });
    // 4. Event reaches DoSA Staff
    review = await findPending(dosaStaff._id, evt._id, "DOSA_STAFF_REVIEW");
    assert(review, "Event must reach DOSA_STAFF_REVIEW");

    // 5/6/7. DoSA Staff detail shows the exact Society budget position (authoritative backend data)
    const detail1 = await workflow.detail(dosaStaff._id, evt._id);
    assert(detail1.budgetPosition, "DoSA Staff must see a budget position");
    assert.equal(detail1.budgetPosition.allocatedAmount, 400000);
    assert.equal(detail1.budgetPosition.utilizedAmount, 8000);
    assert.equal(detail1.budgetPosition.availableAmount, 392000);
    assert.equal(detail1.budgetPosition.requestedAmount, 400000);
    assert.equal(detail1.budgetPosition.projectedRemaining, 392000 - 400000, "shortfall must be -8,000 before any recommendation exists");

    // 8. DoSA Staff keeps the recommendation at the full requested amount (still over budget)
    await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: [{ recommendedAmount: 400000, reviewRemark: "Matches request" }] });
    const detail2 = await workflow.detail(dosaStaff._id, evt._id);
    assert.equal(detail2.budgetPosition.recommendedAmount, 400000);
    assert.equal(detail2.budgetPosition.projectedRemaining, -8000);

    // 9/10/11/12. Forwarding must fail; Event stays at DOSA_STAFF_REVIEW; no ADoSA review created
    await assert.rejects(
      workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" }),
      (error) => {
        assert.equal(error.code, "EVENT_BUDGET_EXCEEDS_AVAILABLE");
        assert.equal(error.message, "The Event is over budget. Kindly check the budget requirement before forwarding.");
        return true;
      }
    );
    let eventAfterBlock = await Event.findById(evt._id).lean();
    assert.equal(eventAfterBlock.status, "DOSA_STAFF_REVIEW", "Event must stay at DOSA_STAFF_REVIEW when over budget");
    assert.equal(await Review.countDocuments({ eventId: evt._id, stage: "ADOSA_REVIEW" }), 0, "no ADoSA review may be created");
    assert.equal((await Review.findById(review._id)).status, "PENDING", "the DoSA Staff review must remain retryable");

    // 13/14/15. DoSA Staff reduces the recommendation to within the available balance; totals recalc correctly
    await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: [{ recommendedAmount: 390000, reviewRemark: "Trimmed to fit available balance" }] });
    let eventAfterTrim = await Event.findById(evt._id).lean();
    assert.equal(eventAfterTrim.budget.totalRecommended, 390000);
    assert.equal(eventAfterTrim.budget.totalEstimated, 400000, "requested total must remain unchanged");
    assert.equal(eventAfterTrim.budget.items[0].estimatedAmount, 400000, "estimatedAmount must still equal quantity * estimatedUnitCost");

    // 16/17. Forward now succeeds (effective amount 390,000 <= available 392,000)
    const decided = await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" });
    assert.equal(decided.event.status, "ADOSA_REVIEW", "Event must move to ADoSA once within budget");
    assert(await Review.exists({ eventId: evt._id, stage: "ADOSA_REVIEW", status: "PENDING" }));

    // 18/19/20. Event leaves the Pending tab, appears under Forwarded, and remains openable
    const pendingAfterForward = await workflow.queue(dosaStaff._id, { status: "PENDING", stage: "DOSA_STAFF_REVIEW" });
    assert(!pendingAfterForward.items.some((x) => String(x.eventId._id) === String(evt._id)), "Event must leave the Pending queue");
    const forwardedList = await workflow.queue(dosaStaff._id, { stage: "DOSA_STAFF_REVIEW", view: "forwarded" });
    assert(forwardedList.items.some((x) => String(x.eventId._id) === String(evt._id)), "Event must appear under Forwarded/Completed history");
    const detail3 = await workflow.detail(dosaStaff._id, evt._id);
    assert.equal(String(detail3._id), String(evt._id), "DoSA Staff must still be able to open the Event");
    assert.equal(detail3.budget.totalRecommended, 390000, "DoSA Staff must still see the amount they recommended");

    // 21. After ADoSA approval, DoSA Staff sees the updated status
    let r = await findPending(adosa._id, evt._id, "ADOSA_REVIEW");
    await workflow.decide({ userId: adosa._id, reviewId: r._id, decision: "APPROVE" });
    const detail4 = await workflow.detail(dosaStaff._id, evt._id);
    assert.equal(detail4.status, "DOSA_REVIEW", "DoSA Staff must see the Event progress to DOSA_REVIEW");

    // 22/23. After DoSA final approval, DoSA Staff can still open it; final deduction mechanism is unchanged
    r = await findPending(dosa._id, evt._id, "DOSA_REVIEW");
    const finalDecision = await workflow.decide({ userId: dosa._id, reviewId: r._id, decision: "APPROVE" });
    assert.equal(finalDecision.event.status, "APPROVED");
    assert.equal(finalDecision.event.budget.deductionStatus, "POSTED");
    assert.equal(finalDecision.event.budget.deductedAmount, 390000);
    const detail5 = await workflow.detail(dosaStaff._id, evt._id);
    assert.equal(detail5.status, "APPROVED", "DoSA Staff must still be able to open the final APPROVED Event");
    const finalBudget = await budgets.getBudget(budget._id);
    assert.equal(finalBudget.utilizedAmount, 8000 + 390000);
    assert.equal(finalBudget.reservedAmount, 0, "no reservation logic may be introduced");
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: evt._id }), 1);

    // 24. Budget Rectification flow still works (light smoke test on a second Event)
    const gs2 = await student("GS-Guard-2");
    await enroll(gs2.user._id, soc._id, gs2.student._id);
    const draft2 = await service.create({ user: gs2.user, student: gs2.student, data: payload(soc._id, "Rectification Smoke Test", date, [{ head: "Banner", quantity: 1, estimatedUnitCost: 1000 }]) });
    let evt2 = await service.submit(gs2.user._id, draft2._id);
    r = await findPending(pres._id, evt2._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: pres._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(assistant._id, evt2._id, "ASSISTANT_REVIEW");
    await workflow.decide({ userId: assistant._id, reviewId: r._id, decision: "APPROVE" });
    r = await findPending(dosaStaff._id, evt2._id, "DOSA_STAFF_REVIEW");
    const rectified = await workflow.decide({ userId: dosaStaff._id, reviewId: r._id, decision: "BUDGET_RECTIFICATION", remarks: "Please reconsider the banner cost." });
    assert.equal(rectified.event.status, "BUDGET_RECTIFICATION_REQUIRED");
    await service.update(gs2.user._id, evt2._id, { budget: { items: [{ head: "Banner", quantity: 1, estimatedUnitCost: 800 }] } });
    evt2 = await service.submit(gs2.user._id, evt2._id);
    assert.equal(evt2.status, "FACULTY_REVIEW", "resubmission after rectification must restart at President, not return to DoSA Staff");
    assert.equal(evt2.revision, 2);

    // 26. Admin remains outside the Event Approval workflow
    assert(!Object.prototype.hasOwnProperty.call(workflow.routing, "ADMIN_REVIEW"));
    assert(!Object.prototype.hasOwnProperty.call(workflow.routing, "SUPER_ADMIN"));

    console.log(
      JSON.stringify(
        {
          passed: true,
          submissionAllowedWhenAvailablePositive: true,
          presidentAssistantApprove: true,
          dosaStaffBudgetPositionExact: true,
          overBudgetRecommendationStillBlocked: true,
          forwardBlockedWithCorrectCodeAndMessage: true,
          eventStaysAtDosaStaffReview: true,
          noAdosaReviewCreated: true,
          reviewRemainsRetryable: true,
          reducedRecommendationRecalculatesCorrectly: true,
          forwardSucceedsWithinBudget: true,
          eventLeavesPendingTab: true,
          eventAppearsInForwardedHistory: true,
          dosaStaffCanStillOpenEvent: true,
          statusVisibleAfterAdosaApproval: true,
          dosaStaffCanOpenFinalApprovedEvent: true,
          finalDeductionUnchanged: true,
          noReservationLogicIntroduced: true,
          budgetRectificationStillWorks: true,
          resubmissionRestartsAtPresident: true,
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
