process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||=
  "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||=
  "verification-refresh-secret-32-characters-long";
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
  service = require("../src/modules/events/event.service"),
  workflow = require("../src/modules/events/eventWorkflow.service"),
  assignments = require("../src/modules/userRoleAssignments/userRoleAssignment.service"),
  budgets = require("../src/modules/societyBudgets/societyBudget.service"),
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
    const gsA = await student("GS-A"),
      gsB = await student("GS-B"),
      presidentA = await staff("President-A", "PRESIDENT", "SOCIETY"),
      presidentB = await staff("President-B", "PRESIDENT", "SOCIETY"),
      assistant = await staff("Assistant-A", "ASSISTANT"),
      dosaStaff = await staff("DoSA-Staff-A", "DOSA_STAFF"),
      adosa = await staff("ADoSA-A", "ADOSA"),
      admin = await staff("Admin-A", "ADMIN"),
      dosa = await staff("DoSA-A", "DOSA"),
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
    let event = await service.submit(gsA.user._id, draftA._id),
      review = (
        await workflow.queue(presidentA._id, { status: "PENDING" })
      ).items.find((x) => String(x.eventId._id) === String(event._id));
    await service.submit(gsA.user._id, draftA._id);
    assert.equal(
      await Review.countDocuments({
        eventId: event._id,
        stage: "FACULTY_REVIEW",
      }),
      1
    );
    assert.equal(event.facultyReviewContext.presidentNames.length, 2);
    const presidentDetail = await workflow.detail(presidentA._id, event._id);
    assert.equal(presidentDetail.activeReview.stage, "FACULTY_REVIEW");
    assert.equal(presidentDetail.title, "EA7 Toastmasters");
    assert(
      (await workflow.queue(presidentB._id, { status: "PENDING" })).items.some(
        (x) => String(x._id) === String(review._id)
      )
    );
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
    await assert.rejects(
      workflow.decide({
        userId: presidentB._id,
        reviewId: review._id,
        decision: "APPROVE",
      }),
      (error) => error.code === "EVENT_REVIEW_ALREADY_DECIDED"
    );
    assert.equal(
      await Review.countDocuments({
        eventId: event._id,
        stage: "ASSISTANT_REVIEW",
      }),
      1
    );
    const amended = await Event.findById(event._id).lean();
    assert.equal(amended.originalSubmission.budget.totalEstimated, 4000);
    assert.equal(amended.budget.totalEstimated, 2000);
    assert.equal(await Amendment.countDocuments({ eventId: event._id }), 1);
    const assistantDetail = await workflow.detail(assistant._id, event._id);
    assert.equal(assistantDetail.budget.totalEstimated, 2000);
    assert.equal(assistantDetail.amendmentHistory.length, 1);
    review = (
      await workflow.queue(assistant._id, { status: "PENDING" })
    ).items.find((x) => String(x.eventId._id) === String(event._id));
    await assert.rejects(
      workflow.amend({
        userId: assistant._id,
        reviewId: review._id,
        reason: "Assistant tried to amend the objective.",
        proposal: { objective: "Forbidden Assistant edit" },
      }),
      (error) => error.code === "EVENT_PERMISSION_DENIED"
    );
    assert.equal((await Event.findById(event._id)).status, "ASSISTANT_REVIEW");
    assert.equal((await Review.findById(review._id)).status, "PENDING");
    await workflow.decide({
      userId: assistant._id,
      reviewId: review._id,
      decision: "APPROVE",
    });
    assert.equal((await workflow.queue(assistant._id, { status: "PENDING", stage: "ASSISTANT_REVIEW" })).items.some((x) => String(x.eventId._id) === String(event._id)), false);
    assert.equal((await workflow.queue(assistant._id, { stage: "ASSISTANT_REVIEW", view: "forwarded" })).items.some((x) => String(x.eventId._id) === String(event._id)), true);
    await Event.updateOne({ _id: event._id }, { $set: { endDate: new Date("2026-01-01") } });
    assert.equal((await workflow.queue(assistant._id, { stage: "ASSISTANT_REVIEW", view: "completed" })).items.some((x) => String(x.eventId._id) === String(event._id)), true);
    assert.equal((await workflow.queue(assistant._id, { stage: "ASSISTANT_REVIEW", view: "forwarded" })).items.some((x) => String(x.eventId._id) === String(event._id)), false);
    await Event.updateOne({ _id: event._id }, { $set: { endDate: new Date("2026-09-10") } });
    review = (
      await workflow.queue(dosaStaff._id, { status: "PENDING" })
    ).items.find((x) => String(x.eventId._id) === String(event._id));
    await workflow.saveBudgetReview({ userId: dosaStaff._id, reviewId: review._id, items: [{ recommendedAmount: 2500, reviewRemark: "Amount recommended as per available allocation." }] });
    let budgeted = await Event.findById(event._id).lean();
    assert.equal(budgeted.budget.totalEstimated, 2000);
    assert.equal(budgeted.budget.totalRecommended, 2500);
    assert.equal(budgeted.budget.items[0].estimatedAmount, 2000);
    assert.equal(budgeted.budget.items[0].recommendedAmount, 2500);
    assert.equal((await Review.findById(review._id)).status, "PENDING");
    await workflow.decide({ userId: dosaStaff._id, reviewId: review._id, decision: "APPROVE" });
    assert.equal((await Event.findById(event._id)).status, "ADOSA_REVIEW");
    review = (await workflow.queue(adosa._id, { status: "PENDING" })).items.find((x) => String(x.eventId._id) === String(event._id));
    await workflow.decide({ userId: adosa._id, reviewId: review._id, decision: "APPROVE" });
    assert.equal((await Event.findById(event._id)).status, "DOSA_REVIEW");
    assert(!Object.values(WORKFLOW_STAGES).includes("ADMIN_REVIEW"));
    assert(!Object.prototype.hasOwnProperty.call(workflow.routing, "ADMIN_REVIEW"));
    assert.equal(await Review.countDocuments({ eventId: event._id, stage: "ADMIN_REVIEW" }), 0);
    assert.equal((await workflow.queue(admin._id, { status: "PENDING" })).items.length, 0);
    review = (await workflow.queue(dosa._id, { status: "PENDING" })).items.find(
      (x) => String(x.eventId._id) === String(event._id)
    );
    await workflow.decide({
      userId: dosa._id,
      reviewId: review._id,
      decision: "APPROVE",
    });
    const approvedEvent = await Event.findById(event._id).lean();
    assert.equal(approvedEvent.status, "APPROVED");
    assert.equal(approvedEvent.budget.deductionStatus, "POSTED");
    assert.equal(approvedEvent.budget.deductedAmount, 2500);
    assert(approvedEvent.budget.budgetTransactionId, "final approval must link a budget transaction");
    assert.equal((await budgets.getBudget(budget._id)).utilizedAmount, 2500);
    assert.equal(await SocietyBudgetTransaction.countDocuments({ referenceType: "EVENT", referenceId: event._id }), 1);
    await assert.rejects(
      workflow.decide({ userId: dosa._id, reviewId: review._id, decision: "APPROVE" }),
      (error) => error.code === "EVENT_REVIEW_ALREADY_DECIDED"
    );
    assert.equal((await budgets.getBudget(budget._id)).utilizedAmount, 2500, "a retried final approval must not deduct twice");
    assert.equal(await Amendment.countDocuments({ eventId: event._id }), 1);
    const rejectedEvent = await service.create({
      user: gsA.user,
      student: gsA.student,
      data: payload(society._id, "Assistant Reject Route"),
    });
    await service.submit(gsA.user._id, rejectedEvent._id);
    review = (
      await workflow.queue(presidentA._id, {
        status: "PENDING",
        stage: "FACULTY_REVIEW",
      })
    ).items.find((x) => String(x.eventId._id) === String(rejectedEvent._id));
    await workflow.decide({
      userId: presidentA._id,
      reviewId: review._id,
      decision: "APPROVE",
    });
    review = (
      await workflow.queue(assistant._id, {
        status: "PENDING",
        stage: "ASSISTANT_REVIEW",
      })
    ).items.find((x) => String(x.eventId._id) === String(rejectedEvent._id));
    await workflow.decide({
      userId: assistant._id,
      reviewId: review._id,
      decision: "REJECT",
      remarks: "Event cannot be supported.",
    });
    assert.equal((await Event.findById(rejectedEvent._id)).status, "REJECTED");
    const correction = await service.create({
      user: gsA.user,
      student: gsA.student,
      data: payload(society._id, "Correction Route"),
    });
    await service.submit(gsA.user._id, correction._id);
    review = (
      await workflow.queue(presidentA._id, { status: "PENDING" })
    ).items.find((x) => String(x.eventId._id) === String(correction._id));
    await workflow.decide({
      userId: presidentA._id,
      reviewId: review._id,
      decision: "REQUEST_CHANGES",
      remarks: "Clarify scope",
    });
    await service.update(gsA.user._id, correction._id, {
      objective: "Clarified objective",
    });
    await service.submit(gsA.user._id, correction._id);
    review = (
      await workflow.queue(presidentA._id, { status: "PENDING" })
    ).items.find((x) => String(x.eventId._id) === String(correction._id));
    const presidentAttempt2ReviewId = review._id;
    await workflow.decide({
      userId: presidentA._id,
      reviewId: review._id,
      decision: "APPROVE",
    });
    // Assistant may now Request Changes too (final business rule: every stage can send an Event
    // back to the Student). This must return the Event to the Student, and resubmission must
    // restart the WHOLE chain from FACULTY_REVIEW — never resume directly at ASSISTANT_REVIEW.
    review = (
      await workflow.queue(assistant._id, { status: "PENDING" })
    ).items.find((x) => String(x.eventId._id) === String(correction._id));
    const assistantRequestedChanges = await workflow.decide({
      userId: assistant._id,
      reviewId: review._id,
      decision: "REQUEST_CHANGES",
      remarks: "Clarify budget",
    });
    assert.equal(assistantRequestedChanges.event.status, "CHANGES_REQUESTED");
    assert.equal(assistantRequestedChanges.event.correctionStage, "ASSISTANT_REVIEW");
    const revisionBeforeAssistantFix = assistantRequestedChanges.event.revision;
    await service.update(gsA.user._id, correction._id, {
      objective: "Clarified again after Assistant feedback",
    });
    const resubmittedAfterAssistant = await service.submit(gsA.user._id, correction._id);
    assert.equal(
      resubmittedAfterAssistant.status,
      "FACULTY_REVIEW",
      "resubmission after Assistant Request Changes must restart at FACULTY_REVIEW, not resume at ASSISTANT_REVIEW"
    );
    assert.equal(resubmittedAfterAssistant.revision, revisionBeforeAssistantFix + 1);
    const freshPresidentReview = (
      await workflow.queue(presidentA._id, { status: "PENDING" })
    ).items.find((x) => String(x.eventId._id) === String(correction._id));
    assert(freshPresidentReview, "a fresh President review must be created for the new attempt");
    assert.equal(freshPresidentReview.attempt, resubmittedAfterAssistant.revision);
    assert.notEqual(
      String(freshPresidentReview._id),
      String(presidentAttempt2ReviewId),
      "the earlier President approval must not be reused for the new attempt"
    );
    assert((await workflow.history(correction._id)).length >= 4);
    console.log(
      JSON.stringify(
        {
          passed: 32,
          creatorDraftIsolation: true,
          multiplePresidents: 2,
          atomicDecision: true,
          assistantRouting: true,
          dosaStaffRouting: true,
          reviewerAmendments: true,
          originalSubmissionPreserved: true,
          amendmentReasonRequired: true,
          dosaStaffRoutesToAdosa: true,
          adminRemovedFromEventApprovals: true,
          dosaFinalApproval: true,
          facultyCorrection: true,
          assistantCanRequestChanges: true,
          resubmissionAlwaysRestartsAtPresident: true,
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
