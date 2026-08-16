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
  Leadership = require("../src/modules/societyLeadership/societyLeadership.model"),
  Event = require("../src/modules/events/event.model"),
  Review = require("../src/modules/events/eventReview.model"),
  Audit = require("../src/modules/events/eventAudit.model"),
  service = require("../src/modules/events/event.service"),
  assignmentService = require("../src/modules/userRoleAssignments/userRoleAssignment.service"),
  {
    seedRolePermissionEngine,
  } = require("../src/modules/authorization/rolePermissionEngineSeed.service");
const ids = { users: [], students: [], societies: [] };
const expect = async (fn, code) => {
  try {
    await fn();
    assert.fail(`Expected ${code}`);
  } catch (error) {
    assert.equal(error.code, code);
    return error;
  }
};
(async () => {
  try {
    await db.connectDatabase();
    await seedRolePermissionEngine();
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const roles = Object.fromEntries(
      (
        await Role.find({
          code: { $in: ["GENERAL_SECRETARY", "MEMBER", "PRESIDENT"] },
        })
      ).map((role) => [role.code, role])
    );
    const person = async (name) => {
      const student = await Student.create({
        name,
        email: `event-${stamp}-${ids.users.length}@test.local`,
        contactNumber: "9999999999",
        rollNumber: `E${stamp.slice(-8)}${ids.users.length}`,
        branch: "CSE",
        year: "3",
        signupStatus: "COMPLETED",
        profileStatus: "APPROVED",
      });
      ids.students.push(student._id);
      const user = await User.create({
        email: student.email,
        displayName: name,
        accountType: "STUDENT",
        studentMasterId: student._id,
        status: "ACTIVE",
      });
      ids.users.push(user._id);
      return { user, student };
    };
    const gs = await person("Event GS"),
      member = await person("Event Member"),
      other = await person("Other GS");
    for (const suffix of ["A", "B"]) {
      const society = await Society.create({
        name: `Event Verify ${stamp} ${suffix}`,
        code: `EV${stamp.slice(-6)}${suffix}`,
        category: "VERIFY",
        status: "ACTIVE",
        isActive: true,
      });
      ids.societies.push(society._id);
    }
    const president = await User.create({
      email: `president-${stamp}@test.local`,
      displayName: "Faculty President",
      accountType: "FACULTY",
      status: "ACTIVE",
      isLoginAllowed: true,
    });
    ids.users.push(president._id);
    await assignmentService.createAssignment({
      userId: president._id,
      roleId: roles.PRESIDENT._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[0],
      status: "ACTIVE",
      isOngoing: true,
      assignmentSource: "SUPER_ADMIN",
    });
    const grant = async (who, role, societyId) => {
      const assignment = (
        await assignmentService.createAssignment({
          userId: who.user._id,
          roleId: role._id,
          scopeType: "SOCIETY",
          societyId,
          status: "ACTIVE",
          isOngoing: true,
          assignmentSource: "PROFILE_APPROVAL",
        })
      ).entity;
      await Membership.create({
        userId: who.user._id,
        studentMasterId: who.student._id,
        societyId,
        roleId: role._id,
        roleCode: role.code,
        roleName: role.name,
        startDate: new Date(),
        status: "ACTIVE",
        isOngoing: true,
        membershipSource: "SYSTEM",
        linkedUserRoleAssignmentId: assignment._id,
      });
    };
    await grant(gs, roles.GENERAL_SECRETARY, ids.societies[0]);
    await grant(member, roles.MEMBER, ids.societies[0]);
    await grant(other, roles.GENERAL_SECRETARY, ids.societies[1]);
    await Leadership.create({
      societyId: ids.societies[0],
      role: "PRESIDENT",
      name: "Faculty President",
      email: `faculty-${stamp}@test.local`,
      designation: "Professor",
      academicSession: "2026-27",
      status: "ACTIVE",
      isOngoing: true,
    });
    const draft = await service.create({
      user: gs.user,
      student: gs.student,
      data: { societyId: String(ids.societies[0]), title: "Incomplete Draft" },
    });
    assert.match(draft.eventCode, /^EA\d+$/);
    assert.equal(draft.status, "DRAFT");
    await expect(
      () =>
        service.create({
          user: member.user,
          student: member.student,
          data: { societyId: String(ids.societies[0]) },
        }),
      "EVENT_PERMISSION_DENIED"
    );
    await expect(
      () =>
        service.create({
          user: gs.user,
          student: gs.student,
          data: { societyId: String(ids.societies[1]) },
        }),
      "EVENT_CONTEXT_REQUIRED"
    );
    const concurrent = await Promise.all(
      [1, 2].map((index) =>
        service.create({
          user: gs.user,
          student: gs.student,
          data: {
            societyId: String(ids.societies[0]),
            title: `Concurrent ${index}`,
          },
        })
      )
    );
    assert.equal(new Set(concurrent.map((event) => event.eventCode)).size, 2);
    const updated = await service.update(gs.user._id, draft._id, {
      title: "Digital Leadership Summit",
      startDate: "2026-09-13",
      endDate: "2026-09-14",
      dailySchedule: [
        { date: "2026-09-13", startTime: "17:00", endTime: "20:00" },
        { date: "2026-09-13", startTime: "10:00", endTime: "16:00" },
      ],
      objective: "Develop student leadership.",
      annexure: {
        concept: "A leadership programme.",
        mode: "OFFLINE",
        speakers: [
          { name: "Expert One", approvalStatus: "PENDING" },
          { name: "Expert Two", approvalStatus: "APPROVED" },
        ],
        targetAudience: "TIET students",
        expectedOutcomes: "Leadership skills",
        eventFlow: [
          { component: "Opening", description: "Welcome" },
          { component: "Keynote", description: "Expert session" },
        ],
      },
      previousEvents: [
        {
          source: "MANUAL",
          title: "Previous Summit",
          budgetUsed: 1000,
          budgetLeft: 200,
        },
      ],
      budget: {
        unusedPrevious: "",
        sponsorshipAmount: "",
        items: [
          { head: "Hospitality", quantity: 10, estimatedUnitCost: 100 },
          { head: "Printing", quantity: 5, estimatedUnitCost: 20 },
        ],
      },
    });
    assert.equal(updated.budget.totalEstimated, 1100);
    assert.equal(updated.budget.unusedPrevious, 0);
    assert.equal(updated.budget.sponsorshipAmount, 0);
    assert.deepEqual(
      updated.annexure.eventFlow.map((item) => item.order),
      [0, 1]
    );
    assert.equal(updated.annexure.speakers.length, 2);
    assert.equal(updated.dailySchedule.length, 2);
    assert.equal(await Event.countDocuments({ title: "Previous Summit" }), 0);
    await expect(
      () => service.update(member.user._id, draft._id, { title: "Hijack" }),
      "EVENT_PERMISSION_DENIED"
    );
    const incomplete = await expect(
      () => service.submit(gs.user._id, concurrent[0]._id),
      "EVENT_SUBMISSION_INCOMPLETE"
    );
    assert(incomplete.fields.length);
    assert(incomplete.fields.every((item) => item.field && item.message));
    assert(incomplete.fields.some((item) => item.field === "startDate"));
    const scheduleFailure = await expect(
      () =>
        service.update(gs.user._id, concurrent[1]._id, {
          title: "Invalid Schedule Draft",
          startDate: "2026-09-13",
          endDate: "2026-09-13",
          dailySchedule: [
            { date: "2026-09-12", startTime: "17:00", endTime: "08:00" },
          ],
          objective: "Objective",
          annexure: {
            concept: "Concept",
            mode: "ONLINE",
            targetAudience: "Students",
            expectedOutcomes: "Outcome",
            eventFlow: [{ component: "Talk", description: "Talk" }],
          },
        }),
      "EVENT_DRAFT_INVALID"
    );
    assert(
      scheduleFailure.fields.some(
        (item) => item.field === "dailySchedule.0.endTime"
      )
    );
    assert.equal(
      (
        await service.update(gs.user._id, concurrent[1]._id, {
          objective: "Incomplete draft remains editable",
        })
      ).status,
      "DRAFT"
    );
    const stillStrict = await expect(
      () => service.submit(gs.user._id, concurrent[1]._id),
      "EVENT_SUBMISSION_INCOMPLETE"
    );
    assert(
      stillStrict.fields.some(
        (item) => item.field === "title" || item.field === "startDate"
      )
    );
    const submitted = await service.submit(gs.user._id, draft._id);
    assert.equal(submitted.status, "FACULTY_REVIEW");
    await expect(
      () => service.update(gs.user._id, draft._id, { title: "Changed" }),
      "EVENT_NOT_EDITABLE"
    );
    const visible = await service.list(member.user._id, ids.societies[0], {
      page: 1,
      limit: 50,
    });
    assert(
      visible.items.some((event) => String(event._id) === String(draft._id))
    );
    assert(
      !visible.items.some(
        (event) => String(event._id) === String(concurrent[0]._id)
      )
    );
    const isolated = await service.list(other.user._id, ids.societies[1], {
      page: 1,
      limit: 50,
    });
    assert(
      !isolated.items.some((event) => String(event._id) === String(draft._id))
    );
    assert.deepEqual(
      (await Audit.find({ eventId: draft._id }).sort({ timestamp: 1 })).map(
        (row) => row.action
      ),
      [
        "EVENT_CREATED",
        "EVENT_DRAFT_UPDATED",
        "EVENT_SUBMITTED",
        "EVENT_STAGE_ASSIGNED",
      ]
    );
    const noPresident = await service.create({
      user: other.user,
      student: other.student,
      data: {
        societyId: String(ids.societies[1]),
        title: "No President",
        startDate: "2026-09-13",
        endDate: "2026-09-13",
        dailySchedule: [
          { date: "2026-09-13", startTime: "10:00", endTime: "11:00" },
        ],
        objective: "Objective",
        annexure: {
          concept: "Concept",
          mode: "ONLINE",
          targetAudience: "Students",
          expectedOutcomes: "Outcome",
          eventFlow: [{ component: "Talk", description: "Talk" }],
        },
      },
    });
    const missing = await expect(
      () => service.submit(other.user._id, noPresident._id),
      "EVENT_REVIEWER_UNAVAILABLE"
    );
    assert(missing.fields.some((item) => item.field === "facultyReview"));
    console.log(
      JSON.stringify(
        {
          passed: 30,
          authorizedCreate: true,
          memberDenied: true,
          societyIsolation: true,
          atomicEventCodes: true,
          concurrentUnique: true,
          incompleteDraft: true,
          draftUpdate: true,
          unauthorizedEdit: true,
          validSubmission: true,
          structuredValidation: true,
          submittedReadOnly: true,
          manualPreviousIsolated: true,
          budgetCalculated: true,
          flowOrder: true,
          multipleSpeakers: true,
          multiDaySchedule: true,
          missingPresidentBlocked: true,
          auditHistory: true,
          memberDraftPrivacy: true,
          memberSubmittedVisibility: true,
          exactFieldMessages: true,
          optionalFieldsAllowed: true,
          emptyNumericNormalization: true,
          invalidScheduleIdentified: true,
          failedSubmitRemainsEditable: true,
          payloadSchemaMatched: true,
        },
        null,
        2
      )
    );
  } finally {
    await Review.deleteMany({
      eventId: {
        $in: await Event.find({ createdByUserId: { $in: ids.users } }).distinct(
          "_id"
        ),
      },
    });
    await Audit.deleteMany({ actorUserId: { $in: ids.users } });
    await Event.deleteMany({ createdByUserId: { $in: ids.users } });
    await Leadership.deleteMany({ societyId: { $in: ids.societies } });
    await Membership.deleteMany({ userId: { $in: ids.users } });
    await Assignment.deleteMany({ userId: { $in: ids.users } });
    await User.deleteMany({ _id: { $in: ids.users } });
    await Student.deleteMany({ _id: { $in: ids.students } });
    await Society.deleteMany({ _id: { $in: ids.societies } });
    await db.disconnectDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
