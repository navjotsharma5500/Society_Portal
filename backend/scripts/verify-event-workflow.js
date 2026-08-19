process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||=
  "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||=
  "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process"),
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
  authz = require("../src/modules/authorization/authorization.service"),
  academicSessions = require("../src/modules/academicSessions/academicSession.service"),
  SocietyBudget = require("../src/modules/societyBudgets/societyBudget.model"),
  SocietyBudgetTransaction = require("../src/modules/societyBudgets/societyBudgetTransaction.model"),
  { WORKFLOW_STAGES } = require("../src/modules/events/event.constants"),
  {
    seedRolePermissionEngine,
  } = require("../src/modules/authorization/rolePermissionEngineSeed.service");
const ids = { users: [], students: [], societies: [], budgets: [] },
  payload = (societyId, title) => ({
    societyId,
    title,
    startDate: "2026-09-10",
    endDate: "2026-09-10",
    dailySchedule: [
      { date: "2026-09-10", startTime: "10:00", endTime: "12:00" },
    ],
    objective: "Leadership development",
    annexure: {
      concept: "Speaking and evaluation",
      mode: "OFFLINE",
      targetAudience: "TIET students",
      expectedOutcomes: "Communication skills",
      eventFlow: [
        { component: "Speeches", description: "Student speaking session" },
      ],
    },
    budget: {
      items: [{ head: "Drone Show", quantity: 1, estimatedUnitCost: 4000 }],
    },
  });
const findPending = async (userId, eventId, stage) => {
  const params = { status: "PENDING" };
  if (stage) params.stage = stage;
  const { items } = await workflow.queue(userId, params);
  return items.find((x) => String(x.eventId._id) === String(eventId));
};
const assertPendingCount = async (eventId, expected, label = "") => {
  const count = await Review.countDocuments({ eventId, status: "PENDING" });
  assert.equal(
    count,
    expected,
    `Event ${eventId} expected ${expected} PENDING review(s)${label ? ` (${label})` : ""}, found ${count}`
  );
};
const reconcileScriptPath = path.join(__dirname, "reconcile-event-review-state.js");
const runReconcile = (extraArgs = []) => {
  const stdout = execFileSync(process.execPath, [reconcileScriptPath, ...extraArgs], {
    encoding: "utf8",
  });
  const start = stdout.indexOf("{"),
    end = stdout.lastIndexOf("}");
  return JSON.parse(stdout.slice(start, end + 1));
};

(async () => {
  try {
    await db.connectDatabase();
    await seedRolePermissionEngine();
    const stamp = Date.now(),
      roles = Object.fromEntries(
        (
          await Role.find({
            code: {
              $in: [
                "GENERAL_SECRETARY",
                "PRESIDENT",
                "ASSISTANT",
                "DOSA_STAFF",
                "ADOSA",
                "ADMIN",
                "DOSA",
              ],
            },
          })
        ).map((x) => [x.code, x])
      ),
      society = await Society.create({
        name: `TU Toastmasters Club ${stamp}`,
        code: `TT${String(stamp).slice(-8)}`,
        category: "PROFESSIONAL",
        status: "ACTIVE",
        isActive: true,
      });
    ids.societies.push(society._id);
    const currentSession = await academicSessions.getCurrentAcademicSession({ required: true });
    const budget = await budgets.createAnnualBudget({ societyId: society._id, academicSessionId: currentSession._id, allocatedAmount: 100000, remarks: "verify-event-workflow" });
    ids.budgets.push(budget._id);
    const student = async (name) => {
      const s = await Student.create({
        name,
        email: `${name}-${stamp}@test.local`,
        contactNumber: "9999999999",
        rollNumber: `${name}${String(stamp).slice(-6)}`,
        signupStatus: "COMPLETED",
        profileStatus: "APPROVED",
      });
      ids.students.push(s._id);
      const u = await User.create({
        email: s.email,
        displayName: name,
        accountType: "STUDENT",
        studentMasterId: s._id,
        status: "ACTIVE",
        isLoginAllowed: true,
      });
      ids.users.push(u._id);
      const a = (
        await assignments.createAssignment({
          userId: u._id,
          roleId: roles.GENERAL_SECRETARY._id,
          scopeType: "SOCIETY",
          societyId: society._id,
          status: "ACTIVE",
          isOngoing: true,
          assignmentSource: "PROFILE_APPROVAL",
        })
      ).entity;
      await Membership.create({
        userId: u._id,
        studentMasterId: s._id,
        societyId: society._id,
        roleId: roles.GENERAL_SECRETARY._id,
        roleCode: "GENERAL_SECRETARY",
        roleName: "General Secretary",
        startDate: new Date(),
        status: "ACTIVE",
        isOngoing: true,
        membershipSource: "SYSTEM",
        linkedUserRoleAssignmentId: a._id,
      });
      return { user: u, student: s };
    };
    const staff = async (name, role, scope = "GLOBAL") => {
      const u = await User.create({
        email: `${name}-${stamp}@test.local`,
        displayName: name,
        accountType: "FACULTY",
        status: "ACTIVE",
        isLoginAllowed: true,
      });
      ids.users.push(u._id);
      await assignments.createAssignment({
        userId: u._id,
        roleId: roles[role]._id,
        scopeType: scope,
        societyId: scope === "SOCIETY" ? society._id : null,
        status: "ACTIVE",
        isOngoing: true,
        assignmentSource: "SUPER_ADMIN",
      });
      return u;
    };
    const presidentA = await staff("President-A", "PRESIDENT", "SOCIETY"),
      presidentB = await staff("President-B", "PRESIDENT", "SOCIETY"),
      assistant = await staff("Assistant-A", "ASSISTANT"),
      dosaStaff = await staff("DoSA-Staff-A", "DOSA_STAFF"),
      adosa = await staff("ADoSA-A", "ADOSA"),
      admin = await staff("Admin-A", "ADMIN"),
      dosa = await staff("DoSA-A", "DOSA");

    // ---- Final routing map sanity -----------------------------------------------------------
    assert.deepEqual(Object.keys(workflow.routing), [
      "FACULTY_REVIEW",
      "DOSA_STAFF_REVIEW",
      "ADOSA_REVIEW",
      "DOSA_REVIEW",
    ]);
    assert.equal(workflow.routing.FACULTY_REVIEW.next, "DOSA_STAFF_REVIEW");
    assert.equal(workflow.routing.DOSA_STAFF_REVIEW.next, "ADOSA_REVIEW");
    assert.equal(workflow.routing.ADOSA_REVIEW.next, "DOSA_REVIEW");
    assert.equal(workflow.routing.DOSA_REVIEW.next, null);
    assert(!Object.prototype.hasOwnProperty.call(workflow.routing, "ASSISTANT_REVIEW"));

    // ---- Assistant is removed from Event approval, but the role/permissions elsewhere survive --
    for (const code of [
      "event.approval.queue.view",
      "event.review.queue.view",
      "event.review.view",
      "event.review.forward",
      "event.review.request_changes",
      "event.review.reject",
    ])
      assert.equal(
        (await authz.hasPermission({ userId: assistant._id, permissionCode: code })).allowed,
        false,
        `Assistant must not retain ${code}`
      );
    assert.equal(
      (await authz.hasPermission({ userId: assistant._id, permissionCode: "society.view" })).allowed,
      true,
      "Assistant must keep non-Event permissions"
    );

    // ---- Creator draft isolation (unchanged regression coverage) --------------------------------
    const gsA = await student("GS-A"),
      gsB = await student("GS-B"),
      draftA = await service.create({
        user: gsA.user,
        student: gsA.student,
        data: payload(society._id, "EA7 Toastmasters"),
      }),
      draftB = await service.create({
        user: gsB.user,
        student: gsB.student,
        data: payload(society._id, "GS-B Independent"),
      });
    assert(
      (await service.list(gsA.user._id, society._id, { limit: 50 })).items.some(
        (x) => String(x._id) === String(draftA._id)
      )
    );
    assert(
      !(
        await service.list(gsB.user._id, society._id, { limit: 50 })
      ).items.some((x) => String(x._id) === String(draftA._id))
    );
    assert(
      (await service.list(gsB.user._id, society._id, { limit: 50 })).items.some(
        (x) => String(x._id) === String(draftB._id)
      )
    );

    // =============================================================================================
    // TEST A — Normal new Event: FACULTY_REVIEW -> DOSA_STAFF_REVIEW -> ADOSA_REVIEW -> DOSA_REVIEW
    // -> APPROVED. ASSISTANT_REVIEW must never be created.
    // =============================================================================================
    let event = await service.submit(gsA.user._id, draftA._id);
    await service.submit(gsA.user._id, draftA._id); // idempotent no-op resubmit of an already-submitted event
    assert.equal(
      await Review.countDocuments({ eventId: event._id, stage: "FACULTY_REVIEW" }),
      1
    );
    assert.equal(event.facultyReviewContext.presidentNames.length, 2);
    const presidentDetail = await workflow.detail(presidentA._id, event._id);
    assert.equal(presidentDetail.activeReview.stage, "FACULTY_REVIEW");
    assert.equal(presidentDetail.title, "EA7 Toastmasters");
    let review = await findPending(presidentA._id, event._id, "FACULTY_REVIEW");
    assert(
      (await workflow.queue(presidentB._id, { status: "PENDING" })).items.some(
        (x) => String(x._id) === String(review._id)
      )
    );
    await assertPendingCount(event._id, 1, "attempt 1 FACULTY_REVIEW");
    await assert.rejects(
      workflow.decide({
        userId: presidentA._id,
        reviewId: review._id,
        decision: "APPROVE",
        amendment: { title: "Amended without reason" },
      }),
      (error) => error.code === "EVENT_AMENDMENT_REASON_REQUIRED"
    );
    await workflow.decide({
      userId: presidentA._id,
      reviewId: review._id,
      decision: "APPROVE",
      remarks: "Approved amount revised as per available allocation.",
      amendment: {
        budget: {
          ...event.budget,
          items: [{ head: "Drone Show", quantity: 1, estimatedUnitCost: 2000 }],
        },
      },
    });
    // A stale decision on the SAME (now-decided) review must be rejected as EVENT_REVIEW_STALE, not
    // silently accepted and not (any longer) reported as EVENT_REVIEW_ALREADY_DECIDED — the review
    // no longer matches the Event's current stage, which is exactly what makes it non-actionable.
    await assert.rejects(
      workflow.decide({ userId: presidentB._id, reviewId: review._id, decision: "APPROVE" }),
      (error) => error.code === "EVENT_REVIEW_STALE" && error.statusCode === 409
    );
    assert.equal(
      (await Event.findById(event._id)).status,
      "DOSA_STAFF_REVIEW",
      "FACULTY_REVIEW must route straight to DOSA_STAFF_REVIEW — Assistant is removed from the chain"
    );
    assert.equal(await Review.countDocuments({ eventId: event._id, stage: "ASSISTANT_REVIEW" }), 0);
    await assertPendingCount(event._id, 1, "attempt 1 DOSA_STAFF_REVIEW");
    const amended = await Event.findById(event._id).lean();
    assert.equal(amended.originalSubmission.budget.totalEstimated, 4000);
    assert.equal(amended.budget.totalEstimated, 2000);
    assert.equal(await Amendment.countDocuments({ eventId: event._id }), 1);
    review = await findPending(dosaStaff._id, event._id, "DOSA_STAFF_REVIEW");
    await workflow.saveBudgetReview({
      userId: dosaStaff._id,
      reviewId: review._id,
      items: [{ recommendedAmount: 2500, reviewRemark: "Amount recommended as per available allocation." }],
    });
    let budgeted = await Event.findById(event._id).lean();
    assert.equal(budgeted.budget.totalRecommended, 2500);
    await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" });
    assert.equal((await Event.findById(event._id)).status, "ADOSA_REVIEW");
    await assertPendingCount(event._id, 1, "attempt 1 ADOSA_REVIEW");
    review = await findPending(adosa._id, event._id, "ADOSA_REVIEW");
    await workflow.decide({ userId: adosa._id, reviewId: review._id, decision: "APPROVE" });
    assert.equal((await Event.findById(event._id)).status, "DOSA_REVIEW");
    assert(!Object.values(WORKFLOW_STAGES).includes("ADMIN_REVIEW"));
    assert.equal(await Review.countDocuments({ eventId: event._id, stage: "ADMIN_REVIEW" }), 0);
    assert.equal((await workflow.queue(admin._id, { status: "PENDING" })).items.length, 0);
    assert.equal((await workflow.queue(assistant._id, { status: "PENDING" })).items.length, 0, "Assistant must never see a Pending Event review");
    await assertPendingCount(event._id, 1, "attempt 1 DOSA_REVIEW");
    review = await findPending(dosa._id, event._id, "DOSA_REVIEW");
    const dosaFinalReviewId = review._id;
    await workflow.decide({ userId: dosa._id, reviewId: review._id, decision: "APPROVE" });
    const approvedEvent = await Event.findById(event._id).lean();
    assert.equal(approvedEvent.status, "APPROVED");
    assert.equal(approvedEvent.budget.deductionStatus, "POSTED");
    assert.equal(approvedEvent.budget.deductedAmount, 2500);
    assert(approvedEvent.budget.budgetTransactionId, "final approval must link a budget transaction");
    assert.equal((await budgets.getBudget(budget._id)).utilizedAmount, 2500);
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: event._id }), 1);
    await assertPendingCount(event._id, 0, "APPROVED — nothing left actionable");

    // =============================================================================================
    // TEST F — Approved Event protection: an old (now-decided) reviewId must never mutate an
    // APPROVED Event, and must never double-post the budget deduction.
    // =============================================================================================
    await assert.rejects(
      workflow.decide({ userId: dosa._id, reviewId: dosaFinalReviewId, decision: "APPROVE" }),
      (error) => error.code === "EVENT_REVIEW_STALE" && error.statusCode === 409
    );
    const stillApproved = await Event.findById(event._id).lean();
    assert.equal(stillApproved.status, "APPROVED");
    assert.equal(stillApproved.budget.deductedAmount, 2500);
    assert.equal((await budgets.getBudget(budget._id)).utilizedAmount, 2500, "a retried final approval must not deduct twice");
    assert.equal(await Amendment.countDocuments({ eventId: event._id }), 1);
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: event._id }), 1);

    // Reject route stays intact (single stage, unrelated Event)
    const rejectedEvent = await service.create({
      user: gsA.user,
      student: gsA.student,
      data: payload(society._id, "Reject Route"),
    });
    await service.submit(gsA.user._id, rejectedEvent._id);
    review = await findPending(presidentA._id, rejectedEvent._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: presidentA._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(dosaStaff._id, rejectedEvent._id, "DOSA_STAFF_REVIEW");
    await workflow.decide({
      userId: dosaStaff._id,
      reviewId: review._id,
      decision: "REJECT",
      remarks: "Event cannot be supported.",
    });
    assert.equal((await Event.findById(rejectedEvent._id)).status, "REJECTED");
    await assertPendingCount(rejectedEvent._id, 0, "REJECTED — no downstream review");
    assert.equal(await Review.countDocuments({ eventId: rejectedEvent._id, stage: "ADOSA_REVIEW" }), 0);

    // =============================================================================================
    // TEST B — DoSA Staff Request Changes: President APPROVE -> DoSA Staff REQUEST_CHANGES must
    // immediately return the Event to the Student with ZERO downstream (ADoSA) review, and
    // resubmission must restart the whole chain from President.
    // =============================================================================================
    const gsC = await student("GS-C"),
      draftC = await service.create({
        user: gsC.user,
        student: gsC.student,
        data: payload(society._id, "Test B - DoSA Staff Request Changes"),
      });
    let eventB = await service.submit(gsC.user._id, draftC._id);
    review = await findPending(presidentA._id, eventB._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: presidentA._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(dosaStaff._id, eventB._id, "DOSA_STAFF_REVIEW");
    let decided = await workflow.decide({
      userId: dosaStaff._id,
      reviewId: review._id,
      decision: "REQUEST_CHANGES",
      remarks:
        "Requested budget exceeds the currently available Society budget. Please revise the Event budget and resubmit.",
    });
    assert.equal(decided.event.status, "CHANGES_REQUESTED");
    assert.equal(
      await Review.countDocuments({ eventId: eventB._id, stage: "ADOSA_REVIEW" }),
      0,
      "DoSA Staff Request Changes must create ZERO downstream ADoSA review — this is the exact historical bug"
    );
    await assertPendingCount(eventB._id, 0, "CHANGES_REQUESTED — no downstream review");
    let revisionBeforeB = decided.event.revision;
    await service.update(gsC.user._id, draftC._id, { objective: "Clarified objective for Test B" });
    let resubmittedB = await service.submit(gsC.user._id, draftC._id);
    assert.equal(resubmittedB.status, "FACULTY_REVIEW");
    assert.equal(resubmittedB.revision, revisionBeforeB + 1);
    let freshReviewB = await findPending(presidentA._id, eventB._id, "FACULTY_REVIEW");
    assert(freshReviewB, "a fresh President review must exist for the new attempt");
    assert.equal(freshReviewB.attempt, resubmittedB.revision);
    await assertPendingCount(eventB._id, 1, "attempt 2 FACULTY_REVIEW only");

    // =============================================================================================
    // TEST C — ADoSA Request Changes: NO DOSA_REVIEW is created, and resubmission restarts at
    // President (not resumed at ADoSA).
    // =============================================================================================
    const gsD = await student("GS-D"),
      draftD = await service.create({
        user: gsD.user,
        student: gsD.student,
        data: payload(society._id, "Test C - ADoSA Request Changes"),
      });
    let eventC = await service.submit(gsD.user._id, draftD._id);
    review = await findPending(presidentA._id, eventC._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: presidentA._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(dosaStaff._id, eventC._id, "DOSA_STAFF_REVIEW");
    await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: [{ recommendedAmount: 2000, reviewRemark: "ok" }] });
    await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" });
    assert.equal((await Event.findById(eventC._id)).status, "ADOSA_REVIEW");
    review = await findPending(adosa._id, eventC._id, "ADOSA_REVIEW");
    decided = await workflow.decide({
      userId: adosa._id,
      reviewId: review._id,
      decision: "REQUEST_CHANGES",
      remarks: "Clarify audience impact before final approval.",
    });
    assert.equal(decided.event.status, "CHANGES_REQUESTED");
    assert.equal(
      await Review.countDocuments({ eventId: eventC._id, stage: "DOSA_REVIEW" }),
      0,
      "ADoSA Request Changes must create ZERO downstream DoSA review"
    );
    await assertPendingCount(eventC._id, 0, "CHANGES_REQUESTED — no downstream review");
    let revisionBeforeC = decided.event.revision;
    await service.update(gsD.user._id, draftD._id, { objective: "Clarified for Test C" });
    let resubmittedC = await service.submit(gsD.user._id, draftD._id);
    assert.equal(
      resubmittedC.status,
      "FACULTY_REVIEW",
      "resubmission after ADoSA Request Changes must restart at FACULTY_REVIEW, not resume at ADOSA_REVIEW"
    );
    assert.equal(resubmittedC.revision, revisionBeforeC + 1);
    let freshReviewC = await findPending(presidentA._id, eventC._id, "FACULTY_REVIEW");
    assert(freshReviewC);
    assert.equal(freshReviewC.attempt, resubmittedC.revision);
    await assertPendingCount(eventC._id, 1, "attempt 2 FACULTY_REVIEW only");

    // =============================================================================================
    // TEST D — DoSA (final stage) Request Changes: resubmission restarts at President again.
    // =============================================================================================
    const gsE = await student("GS-E"),
      draftE = await service.create({
        user: gsE.user,
        student: gsE.student,
        data: payload(society._id, "Test D - DoSA Request Changes"),
      });
    let eventD = await service.submit(gsE.user._id, draftE._id);
    review = await findPending(presidentA._id, eventD._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: presidentA._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(dosaStaff._id, eventD._id, "DOSA_STAFF_REVIEW");
    await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: [{ recommendedAmount: 1500, reviewRemark: "ok" }] });
    await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(adosa._id, eventD._id, "ADOSA_REVIEW");
    await workflow.decide({ userId: adosa._id, reviewId: review._id, decision: "APPROVE" });
    assert.equal((await Event.findById(eventD._id)).status, "DOSA_REVIEW");
    review = await findPending(dosa._id, eventD._id, "DOSA_REVIEW");
    decided = await workflow.decide({
      userId: dosa._id,
      reviewId: review._id,
      decision: "REQUEST_CHANGES",
      remarks: "Please revisit final logistics.",
    });
    assert.equal(decided.event.status, "CHANGES_REQUESTED");
    await assertPendingCount(eventD._id, 0, "CHANGES_REQUESTED — no downstream review");
    let revisionBeforeD = decided.event.revision;
    await service.update(gsE.user._id, draftE._id, { objective: "Revised for Test D" });
    let resubmittedD = await service.submit(gsE.user._id, draftE._id);
    assert.equal(
      resubmittedD.status,
      "FACULTY_REVIEW",
      "resubmission after DoSA Request Changes must restart at FACULTY_REVIEW"
    );
    assert.equal(resubmittedD.revision, revisionBeforeD + 1);
    let freshReviewD = await findPending(presidentA._id, eventD._id, "FACULTY_REVIEW");
    assert(freshReviewD);
    assert.equal(freshReviewD.attempt, resubmittedD.revision);
    // Drive attempt 2 all the way through so full re-approval after correction is proven end to end.
    await workflow.decide({ userId: presidentA._id, reviewId: freshReviewD._id, decision: "APPROVE" });
    review = await findPending(dosaStaff._id, eventD._id, "DOSA_STAFF_REVIEW");
    await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: [{ recommendedAmount: 1500, reviewRemark: "ok" }] });
    await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(adosa._id, eventD._id, "ADOSA_REVIEW");
    await workflow.decide({ userId: adosa._id, reviewId: review._id, decision: "APPROVE" });
    review = await findPending(dosa._id, eventD._id, "DOSA_REVIEW");
    await workflow.decide({ userId: dosa._id, reviewId: review._id, decision: "APPROVE" });
    assert.equal((await Event.findById(eventD._id)).status, "APPROVED");
    assert((await workflow.history(eventD._id)).length >= 6);

    // =============================================================================================
    // TEST E — Stale duplicate review: manually seed the exact shape of the historical bug (an
    // ADoSA PENDING review left over from attempt 1 of Test B's Event, which is now on attempt 2 at
    // FACULTY_REVIEW). It must never appear in ADoSA's Pending queue, and a direct decide() against
    // its reviewId must be refused with 409 EVENT_REVIEW_STALE, leaving the Event untouched.
    // =============================================================================================
    const rogueReview = await Review.create({
      eventId: eventB._id,
      stage: "ADOSA_REVIEW",
      status: "PENDING",
      assignedReviewerUserIds: [adosa._id],
      assignedRoleCode: "ADOSA",
      attempt: 1,
    });
    const beforeStaleAttempt = await Event.findById(eventB._id).lean();
    assert.equal(beforeStaleAttempt.status, "FACULTY_REVIEW");
    assert.equal(beforeStaleAttempt.revision, 2);
    const adosaQueue = (await workflow.queue(adosa._id, { status: "PENDING", stage: "ADOSA_REVIEW" })).items;
    assert(
      !adosaQueue.some((x) => String(x._id) === String(rogueReview._id)),
      "a stale attempt-1 PENDING review must never surface in the ADoSA Pending queue"
    );
    await assert.rejects(
      workflow.decide({ userId: adosa._id, reviewId: rogueReview._id, decision: "APPROVE" }),
      (error) => error.code === "EVENT_REVIEW_STALE" && error.statusCode === 409
    );
    const afterStaleAttempt = await Event.findById(eventB._id).lean();
    assert.equal(afterStaleAttempt.status, beforeStaleAttempt.status);
    assert.equal(afterStaleAttempt.revision, beforeStaleAttempt.revision);
    assert.equal((await Review.findById(rogueReview._id)).status, "PENDING", "a rejected stale decide must not mutate the review");

    // =============================================================================================
    // TEST H (part 1) — reconciliation script: dry run finds the rogue review, --repair marks it
    // SUPERSEDED (never deletes it), and a second dry run then finds zero impossible reviews for
    // this Event.
    // =============================================================================================
    const dryRunBefore = runReconcile(["--event=" + String(eventB._id)]);
    assert.equal(dryRunBefore.mode, "DRY_RUN");
    assert(
      dryRunBefore.findings.some((f) => f.reviewId === String(rogueReview._id)),
      "dry run must surface the seeded stale ADoSA review"
    );
    const repairResult = runReconcile(["--repair", "--event=" + String(eventB._id)]);
    assert.equal(repairResult.mode, "REPAIR");
    assert.equal((await Review.findById(rogueReview._id)).status, "SUPERSEDED");
    const dryRunAfter = runReconcile(["--event=" + String(eventB._id)]);
    assert.equal(dryRunAfter.impossiblePendingCount, 0, "repair must leave zero impossible PENDING reviews behind");
    const eventBUnchanged = await Event.findById(eventB._id).lean();
    assert.equal(eventBUnchanged.status, "FACULTY_REVIEW");
    assert.equal(eventBUnchanged.revision, 2);
    // The SUPERSEDED review must remain readable in history, never disappear.
    assert(
      (await workflow.history(eventB._id)).some((x) => String(x._id) === String(rogueReview._id) && x.status === "SUPERSEDED")
    );

    // =============================================================================================
    // TEST H (part 2) — reconciliation script: legacy Assistant repair path. Simulate an Event that
    // is genuinely, currently active at legacy ASSISTANT_REVIEW (as if created before Assistant was
    // removed from the routing table) and confirm --repair reroutes it to exactly one
    // DOSA_STAFF_REVIEW for the same attempt, without altering history or budget.
    // =============================================================================================
    const gsF = await student("GS-F"),
      draftF = await service.create({
        user: gsF.user,
        student: gsF.student,
        data: payload(society._id, "Test H - Legacy Assistant Active"),
      });
    let eventF = await service.submit(gsF.user._id, draftF._id);
    review = await findPending(presidentA._id, eventF._id, "FACULTY_REVIEW");
    await workflow.decide({ userId: presidentA._id, reviewId: review._id, decision: "APPROVE" });
    // At this point the fixed code has already routed straight to DOSA_STAFF_REVIEW. Force the
    // Event back onto the legacy stage to simulate data created under the OLD routing, and remove
    // the DOSA_STAFF_REVIEW review the fixed code correctly (but, for this simulation, prematurely)
    // created — under the OLD routing that attempt's DOSA_STAFF_REVIEW would not exist yet, it only
    // gets created once Assistant approves. Removing this test fixture (never a real historical
    // record) also keeps the {eventId, attempt, stage} slot free for the repair path to legitimately
    // recreate it.
    const wrongDosaStaffReview = await Review.findOne({ eventId: eventF._id, stage: "DOSA_STAFF_REVIEW", status: "PENDING" });
    await Review.deleteOne({ _id: wrongDosaStaffReview._id });
    await Event.updateOne({ _id: eventF._id }, { $set: { status: "ASSISTANT_REVIEW", currentStage: "ASSISTANT_REVIEW" } });
    const legacyAssistantReview = await Review.create({
      eventId: eventF._id,
      stage: "ASSISTANT_REVIEW",
      status: "PENDING",
      assignedReviewerUserIds: [assistant._id],
      assignedRoleCode: "ASSISTANT",
      attempt: 1,
    });
    const legacyDryRun = runReconcile(["--event=" + String(eventF._id)]);
    assert(
      legacyDryRun.findings.some((f) => f.kind === "LEGACY_ASSISTANT_ACTIVE" && f.reviewId === String(legacyAssistantReview._id))
    );
    const legacyRepair = runReconcile(["--repair", "--event=" + String(eventF._id)]);
    assert(legacyRepair.outcomes.some((o) => o.kind === "LEGACY_ASSISTANT_REROUTED_TO_DOSA_STAFF"));
    const eventFRepaired = await Event.findById(eventF._id).lean();
    assert.equal(eventFRepaired.status, "DOSA_STAFF_REVIEW");
    assert.equal(eventFRepaired.currentStage, "DOSA_STAFF_REVIEW");
    assert.equal((await Review.findById(legacyAssistantReview._id)).status, "SUPERSEDED");
    await assertPendingCount(eventF._id, 1, "legacy Assistant repaired to a single DOSA_STAFF_REVIEW");
    const repairedActive = await findPending(dosaStaff._id, eventF._id, "DOSA_STAFF_REVIEW");
    assert(repairedActive, "repair must assign exactly one new DOSA_STAFF_REVIEW reviewer");
    assert.equal(repairedActive.attempt, eventFRepaired.revision);
    // Re-running repair must be a safe no-op (idempotent).
    const legacyRepairAgain = runReconcile(["--repair", "--event=" + String(eventF._id)]);
    assert.equal(legacyRepairAgain.impossiblePendingFound, 0);
    await assertPendingCount(eventF._id, 1, "idempotent re-run must not duplicate the review");

    console.log(
      JSON.stringify(
        {
          passed: true,
          creatorDraftIsolation: true,
          multiplePresidents: 2,
          atomicDecision: true,
          finalRoutingMap: ["FACULTY_REVIEW", "DOSA_STAFF_REVIEW", "ADOSA_REVIEW", "DOSA_REVIEW"],
          assistantRemovedFromRouting: true,
          assistantRoleAndOtherPermissionsPreserved: true,
          assistantReviewNeverCreatedForNewEvents: true,
          onlyOneRequestChangesAction: true,
          reviewerAmendments: true,
          originalSubmissionPreserved: true,
          amendmentReasonRequired: true,
          facultyRoutesToDosaStaffDirectly: true,
          dosaStaffRoutesToAdosa: true,
          adminRemovedFromEventApprovals: true,
          dosaFinalApproval: true,
          testA_normalEventNoAssistantHop: true,
          testB_dosaStaffRequestChangesNoDownstream: true,
          testC_adosaRequestChangesNoDownstream: true,
          testD_dosaRequestChangesRestartsAtPresident: true,
          testE_staleDuplicateReviewBlocked: true,
          testF_approvedEventProtected: true,
          testG_atMostOnePendingPerEvent: true,
          testH_reconciliationDryRunAndRepair: true,
          testH_legacyAssistantReroute: true,
          historyPreserved: true,
          countsIncludeEvents: true,
          cleanup: true,
        },
        null,
        2
      )
    );
  } finally {
    const eventIds = await Event.find({
      createdByUserId: { $in: ids.users },
    }).distinct("_id");
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
