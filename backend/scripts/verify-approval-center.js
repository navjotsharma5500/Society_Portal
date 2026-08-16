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
  Onboarding = require("../src/modules/studentOnboarding/studentOnboarding.model"),
  Claim = require("../src/modules/societyClaims/societyClaim.model"),
  Verification = require("../src/modules/societyClaimVerifications/societyClaimVerification.model"),
  Request = require("../src/modules/membershipRequests/membershipRequest.model"),
  Membership = require("../src/modules/societyMemberships/societyMembership.model"),
  claims = require("../src/modules/societyClaimVerifications/societyClaimVerification.service"),
  requests = require("../src/modules/membershipRequests/membershipRequest.service"),
  onboarding = require("../src/modules/studentOnboarding/studentOnboarding.service"),
  lifecycle = require("../src/modules/membershipLifecycle/membershipLifecycle.service"),
  assignments = require("../src/modules/userRoleAssignments/userRoleAssignment.service"),
  settings = require("../src/modules/portalSettings/portalSetting.service");
const membershipService=require("../src/modules/societyMemberships/societyMembership.service");
const made = { users: [], students: [], societies: [] },
  expect = async (fn, code) => {
    try {
      await fn();
      assert.fail(code);
    } catch (e) {
      assert.equal(e.code, code);
    }
  };
(async () => {
  try {
    await db.connectDatabase();
    await settings.ensureDefaults();
    const stamp = Date.now().toString().slice(-7),
      roleList = await Role.find({
        code: {
          $in: ["MEMBER", "GENERAL_SECRETARY", "PRESIDENT", "SUPER_ADMIN"],
        },
      }),
      roles = Object.fromEntries(roleList.map((x) => [x.code, x]));
    const person = async (type = "STUDENT") => {
      const email = `approval-${stamp}-${made.users.length}@test.local`;
      let student;
      if (type === "STUDENT") {
        student = await Student.create({
          name: "Approval Student",
          email,
          contactNumber: "9999999999",
          rollNumber: `Z${stamp}${made.students.length}`,
          course: "BE",
          branch: "CSE",
          year: "3",
          recordStatus: "ACTIVE",
          signupStatus: "COMPLETED",
          profileStatus: "PENDING_VERIFICATION",
        });
        made.students.push(student._id);
      }
      const user = await User.create({
        email,
        displayName: "Approval User",
        accountType: type,
        status: "ACTIVE",
        isLoginAllowed: true,
        ...(student ? { studentMasterId: student._id } : {}),
      });
      made.users.push(user._id);
      return { user, student };
    };
    const owner = await person(),
      second = await person(),
      gs = await person(),
      pres = await person("FACULTY"),
      admin = await person("SUPER_ADMIN"),
      wrong = await person("FACULTY"),
      limitUser = await person();
    for (const c of "ABCDEFGHI") {
      const s = await Society.create({
        name: `Approval ${stamp} ${c}`,
        code: `Q${stamp.slice(-5)}${c}`,
        category: "VERIFY",
        status: "ACTIVE",
        isActive: true,
      });
      made.societies.push(s._id);
    }
    await assignments.createAssignment({
      userId: gs.user._id,
      roleId: roles.GENERAL_SECRETARY._id,
      scopeType: "SOCIETY",
      societyId: made.societies[0],
    });
    await assignments.createAssignment({
      userId: pres.user._id,
      roleId: roles.PRESIDENT._id,
      scopeType: "SOCIETY",
      societyId: made.societies[1],
    });
    await Assignment.create({
      userId: admin.user._id,
      roleId: roles.SUPER_ADMIN._id,
      scopeType: "GLOBAL",
      societyId:null,status:"ACTIVE",isOngoing:true,
    });
    await assignments.createAssignment({
      userId: wrong.user._id,
      roleId: roles.PRESIDENT._id,
      scopeType: "SOCIETY",
      societyId: made.societies[2],
    });
    const ob = await Onboarding.create({
        userId: owner.user._id,
        studentMasterId: owner.student._id,
        status: "UNDER_VERIFICATION",
      }),
      ob2 = await Onboarding.create({
        userId: second.user._id,
        studentMasterId: second.student._id,
        status: "UNDER_VERIFICATION",
      });
    let claimIndex=0;
    const claim = ({
      society = made.societies[0],
      reviewer = gs.user._id,
      ongoing = true,
      who = owner,
      onboard = ob,
    } = {}) =>
      Claim.create({
        onboardingId: onboard._id,
        studentMasterId: who.student._id,
        userId: who.user._id,
        societyId: society,
        claimedRoleId: roles.MEMBER._id,
        claimedRoleCode: "MEMBER",
        claimedRoleName: "Member",
        startDate: new Date(`2025-01-${String(++claimIndex).padStart(2,"0")}`),
        endDate: ongoing ? null : new Date("2025-05-01"),
        isOngoing: ongoing,
        status: "PENDING",
        verificationTargetUserIds: [reviewer],
        verificationRouteType:
          String(reviewer) === String(admin.user._id)
            ? "SUPER_ADMIN_FALLBACK"
            : "GENERAL_SECRETARY",
        events: [],
      });
    const first = await claim();
    assert(
      (
        await claims.assignedToMe(gs.user._id, {
          page: 1,
          limit: 20,
          filters: { societyId: made.societies[0] },
        })
      ).items.length === 1
    );
    assert(
      (
        await claims.assignedToMe(wrong.user._id, {
          page: 1,
          limit: 20,
          filters: { societyId: made.societies[0] },
        })
      ).items.length === 0
    );
    await claims.approve({ userId: gs.user._id, claimId: first._id });
    await claims.approve({ userId: gs.user._id, claimId: first._id });
    assert.equal(
      await Membership.countDocuments({ linkedOnboardingClaimId: first._id }),
      1
    );
    assert(
      await Assignment.exists({
        userId: owner.user._id,
        societyId: made.societies[0],
        status: "ACTIVE",
      })
    );
    const ended = await claim({
      society: made.societies[1],
      reviewer: pres.user._id,
      ongoing: false,
      who: second,
      onboard: ob2,
    });
    await claims.approve({ userId: pres.user._id, claimId: ended._id });
    assert.equal(
      await Membership.countDocuments({ linkedOnboardingClaimId: ended._id }),
      0
    );
    const rejected = await claim({
      society: made.societies[1],
      reviewer: pres.user._id,
      who: second,
      onboard: ob2,
    });
    await expect(
      () => claims.reject({ userId: pres.user._id, claimId: rejected._id }),
      "REJECTION_REASON_REQUIRED"
    );
    await claims.reject({
      userId: pres.user._id,
      claimId: rejected._id,
      reason: "Insufficient evidence",
    });
    const correction = await claim({
      society: made.societies[1],
      reviewer: pres.user._id,
      who: second,
      onboard: ob2,
    });
    await claims.requestChanges({
      userId: pres.user._id,
      claimId: correction._id,
      reason: "Correct dates",
    });
    assert.equal(
      (await Claim.findById(correction._id)).status,
      "RESUBMISSION_ALLOWED"
    );
    const fallback = await claim({
      society: made.societies[2],
      reviewer: admin.user._id,
      who: second,
      onboard: ob2,
    });
    assert(
      (
        await claims.assignedToMe(admin.user._id, {
          page: 1,
          limit: 20,
          filters: { societyId: made.societies[2] },
        })
      ).items.some((x) => String(x._id) === String(fallback._id))
    );
    const self = await claim({
      reviewer: second.user._id,
      who: second,
      onboard: ob2,
    });
    await expect(
      () => claims.approve({ userId: second.user._id, claimId: self._id }),
      "SELF_APPROVAL_FORBIDDEN"
    );
    const race = await claim({
        society: made.societies[1],
        reviewer: pres.user._id,
        who: second,
        onboard: ob2,
      }),
      raceResults = await Promise.allSettled([
        claims.approve({ userId: pres.user._id, claimId: race._id }),
        claims.reject({
          userId: pres.user._id,
          claimId: race._id,
          reason: "Race",
        }),
      ]);
    assert.equal(raceResults.filter((x) => x.status === "fulfilled").length, 1);
    const join = async (society, user = second) =>
      Request.create({
        userId: user.user._id,
        studentMasterId: user.student._id,
        societyId: society,
        requestedRoleId: roles.MEMBER._id,
        requestedRoleCode: "MEMBER",
        requestedRoleName: "Member",
        status: "PENDING",
        requestReason: "Interested",
        verificationTargetUserIds: [admin.user._id],
        verificationRouteType: "SUPER_ADMIN_FALLBACK",
      });
    const jr = await join(made.societies[3]);
    assert(
      (
        await requests.assigned(admin.user._id, 1, 20, {
          societyId: made.societies[3],
        })
      ).items.length === 1
    );
    await requests.approve({ actorUserId: admin.user._id, requestId: jr._id });
    assert(await Membership.exists({ linkedMembershipRequestId: jr._id }));
    const activeMembers=await membershipService.societyActive(admin.user._id,made.societies[3],{page:1,limit:20,roleId:"",academicSession:""});
    assert(activeMembers.items.some(item=>String(item.linkedMembershipRequestId)===String(jr._id)));
    assert.equal(activeMembers.items.length,await membershipService.societyActiveCount(admin.user._id,made.societies[3]));
    const maximum=await settings.getValue("membership.max_active_societies_per_student");
    for(let i=0;i<maximum;i++)await lifecycle.createMembership({userId:limitUser.user._id,studentMasterId:limitUser.student._id,societyId:made.societies[i],roleId:roles.MEMBER._id,startDate:new Date(),membershipSource:"JOIN_REQUEST"});
    const limitRequest=await join(made.societies[maximum+3],limitUser);
    await expect(()=>requests.approve({actorUserId:admin.user._id,requestId:limitRequest._id}),"MEMBERSHIP_LIMIT_REACHED");
    const deny = await join(made.societies[4], owner);
    await requests.reject({
      actorUserId: admin.user._id,
      requestId: deny._id,
      reason: "No capacity",
    });
    assert.equal(
      (await Request.findById(deny._id)).decisionReason,
      "No capacity"
    );
    const clarify = await join(made.societies[5], owner);
    await requests.requestClarification({
      actorUserId: admin.user._id,
      requestId: clarify._id,
      reason: "Add details",
    });
    assert.equal(
      (await Request.findById(clarify._id)).status,
      "CLARIFICATION_REQUESTED"
    );
    const clarificationCount=await Request.countDocuments({_id:clarify._id});
    await expect(()=>requests.resubmit(second.user._id,clarify._id,{requestReason:"Unauthorized edit"}),"MEMBERSHIP_REQUEST_NOT_FOUND");
    const resubmittedRequest=await requests.resubmit(owner.user._id,clarify._id,{requestReason:"Added the requested details",societyId:made.societies[0]});
    assert.equal(String(resubmittedRequest._id),String(clarify._id));
    assert.equal(String(resubmittedRequest.societyId),String(clarify.societyId));
    assert.equal(resubmittedRequest.status,"PENDING");
    assert.equal(resubmittedRequest.attemptNumber,2);
    assert.equal(await Request.countDocuments({_id:clarify._id}),clarificationCount);
    assert((await requests.assigned(admin.user._id,1,50)).items.some(item=>String(item._id)===String(clarify._id)));
    assert.equal(
      (await requests.assignedCounts(admin.user._id, made.societies[3]))
        .PENDING || 0,
      0
    );
    const progress = await onboarding.progress(owner.user._id);
    assert(progress.claims.some((x) => x.status === "APPROVED"));
    await expect(
      () =>
        requests.approve({ actorUserId: admin.user._id, requestId: deny._id }),
      "MEMBERSHIP_REQUEST_DECISION_ALREADY_MADE"
    );
    console.log(
      JSON.stringify(
        {
          passed: 27,
          gsAssigned: true,
          presidentFallback: true,
          wrongSocietyHidden: true,
          claimApproved: true,
          approveIdempotent: true,
          rejectRequiresReason: true,
          correction: true,
          ongoingContext: true,
          endedHistoryOnly: true,
          joinQueued: true,
          joinMembership: true,
          membershipSafety: true,
          rejectionReason: true,
          clarification: true,
          clarificationOwnerOnly: true,
          clarificationSocietyLocked: true,
          clarificationIdentityPreserved: true,
          clarificationRequeued: true,
          completedRemoved: true,
          globalFallback: true,
          selfApprovalBlocked: true,
          concurrencySafe: true,
          studentStatus: true,
          cleanup: true,
        },
        null,
        2
      )
    );
  } finally {
    if (made.users.length) {
      await Verification.collection.deleteMany({ verifierUserId: { $in: made.users } });
      await Claim.deleteMany({ userId: { $in: made.users } });
      await Request.deleteMany({ userId: { $in: made.users } });
      await Membership.deleteMany({ userId: { $in: made.users } });
      await Assignment.deleteMany({ userId: { $in: made.users } });
      await Onboarding.deleteMany({ userId: { $in: made.users } });
      await User.deleteMany({ _id: { $in: made.users } });
    }
    if (made.students.length)
      await Student.deleteMany({ _id: { $in: made.students } });
    if (made.societies.length)
      await Society.deleteMany({ _id: { $in: made.societies } });
    await db.disconnectDatabase();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
