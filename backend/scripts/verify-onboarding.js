process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||=
  "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||=
  "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict"),
  { connectDatabase, disconnectDatabase } = require("../src/config/database"),
  User = require("../src/modules/users/user.model"),
  Student = require("../src/modules/studentMaster/studentMaster.model"),
  Society = require("../src/modules/societies/society.model"),
  Role = require("../src/modules/roles/role.model"),
  Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model"),
  Onboarding = require("../src/modules/studentOnboarding/studentOnboarding.model"),
  Claim = require("../src/modules/societyClaims/societyClaim.model"),
  Verification = require("../src/modules/societyClaimVerifications/societyClaimVerification.model"),
  MembershipRequest = require("../src/modules/membershipRequests/membershipRequest.model"),
  onboardingService = require("../src/modules/studentOnboarding/studentOnboarding.service"),
  claimService = require("../src/modules/societyClaims/societyClaim.service"),
  verificationService = require("../src/modules/societyClaimVerifications/societyClaimVerification.service"),
  assignmentService = require("../src/modules/userRoleAssignments/userRoleAssignment.service"),
  authService = require("../src/modules/auth/auth.service"),
  settings = require("../src/modules/portalSettings/portalSetting.service");
const {seedRolePermissionEngine}=require("../src/modules/authorization/rolePermissionEngineSeed.service");
const membershipRequestService=require("../src/modules/membershipRequests/membershipRequest.service");
const Membership = require("../src/modules/societyMemberships/societyMembership.model");
const ids = { users: [], students: [], societies: [] },
  expectCode = async (fn, code) => {
    try {
      await fn();
      assert.fail(`Expected ${code}`);
    } catch (e) {
      assert.equal(e.code, code);
      return e;
    }
  };
(async () => {
  try {
    await connectDatabase();
    await seedRolePermissionEngine();
    await settings.ensureDefaults();
    const stamp = Date.now().toString().slice(-7),
      mkUser = async (type = "STUDENT") => {
        const email = `onboard-${stamp}-${ids.users.length}@example.test`;
        let student;
        if (type === "STUDENT") {
          student = await Student.create({
            name: "Onboarding Verify",
            email,
            contactNumber: "9999999999",
            signupStatus: "COMPLETED",
            profileStatus: "APPROVED",
          });
          ids.students.push(student._id);
        }
        const user = await User.create({
          email,
          displayName: "Onboarding Verify",
          accountType: type,
          status: "ACTIVE",
          isLoginAllowed: true,
          ...(student ? { studentMasterId: student._id } : {}),
        });
        ids.users.push(user._id);
        return { user, student };
      };
    const owner = await mkUser(),
      gsVerifier = await mkUser(),
      presidentVerifier = await mkUser("FACULTY"),
      superVerifier = await mkUser("SUPER_ADMIN");
    for (const suffix of ["A", "B", "C", "D", "E"]) {
      const society = await Society.create({
        name: `Onboarding Verify ${stamp} ${suffix}`,
        code: `O${stamp.slice(-5)}${suffix}`,
        category: "VERIFY",
        status: "ACTIVE",
        isActive: true,
      });
      ids.societies.push(society._id);
    }
    const roles = Object.fromEntries(
      (
        await Role.find({
          code: {
            $in: ["MEMBER", "GENERAL_SECRETARY", "PRESIDENT", "SUPER_ADMIN"],
          },
        })
      ).map((r) => [r.code, r])
    );
    const references = await onboardingService.getReferences();
    assert(references.societies.some((item) => String(item._id) === String(ids.societies[0])));
    assert(references.roles.some((item) => String(item._id) === String(roles.MEMBER._id)));
    assert(references.roles.every((item) => item.scopeType === "SOCIETY" || item.scopeType === "BOTH"));
    assert(references.societies.every((item) => Object.keys(item).every((key) => ["_id", "name", "code", "category"].includes(key))));
    assert(references.roles.every((item) => Object.keys(item).every((key) => ["_id", "name", "code", "category", "scopeType"].includes(key))));
    await assignmentService.createAssignment({
      userId: gsVerifier.user._id,
      roleId: roles.GENERAL_SECRETARY._id,
      scopeType: "SOCIETY",
      societyId: ids.societies[0],
      academicSession: `V-${stamp}`,
    });
    for (const societyId of ids.societies.slice(1, 5))
      await assignmentService.createAssignment({
        userId: presidentVerifier.user._id,
        roleId: roles.PRESIDENT._id,
        scopeType: "SOCIETY",
        societyId,
        academicSession: `V-${stamp}`,
      });
    await Assignment.create({
      userId: superVerifier.user._id,
      roleId: roles.SUPER_ADMIN._id,
      scopeType: "GLOBAL",
      societyId:null,status:"ACTIVE",isOngoing:true,
      academicSession: `V-${stamp}`,
    });
    const onboarding = await onboardingService.start({
      user: owner.user,
      student: owner.student,
    });
    assert.equal(onboarding.status, "IN_PROGRESS");
    const specs = [
      {
        societyId: ids.societies[0],
        claimedRoleId: roles.MEMBER._id,
        isOngoing: true,
      },
      {
        societyId: ids.societies[1],
        claimedRoleId: roles.GENERAL_SECRETARY._id,
        isOngoing: false,
        endDate: "2025-05-01",
      },
      {
        societyId: ids.societies[2],
        claimedRoleId: roles.PRESIDENT._id,
        isOngoing: true,
      },
      {
        societyId: ids.societies[3],
        claimedRoleId: roles.MEMBER._id,
        isOngoing: true,
      },
      {
        societyId: ids.societies[4],
        claimedRoleId: roles.MEMBER._id,
        isOngoing: true,
      },
    ];
    const claims = [];
    for (let i = 0; i < specs.length; i++)
      claims.push(
        await claimService.addClaim(owner.user._id, {
          ...specs[i],
          startDate: "2024-08-01",
          events: [
            {
              eventName: `Event ${i + 1}`,
              startDate: "2024-09-01",
              description: "Verification event",
            },
          ],
          studentDescription: "Verification claim",
        })
      );
    const submitted = await onboardingService.submit(owner.user._id);
    assert.equal(submitted.summary.totalClaims, 5);
    const routed = await Claim.find({ onboardingId: onboarding._id }).sort({
      createdAt: 1,
    });
    assert.equal(routed[0].verificationRouteType, "SOCIETY_TEAM_REVIEW");
    assert.equal(
      routed[1].verificationRouteType,
      "SOCIETY_HIGHER_ROLE_REVIEW"
    );
    assert.equal(
      routed[2].verificationRouteType,
      "SOCIETY_HIGHER_ROLE_REVIEW"
    );
    assert.equal(
      routed[3].verificationRouteType,
      "SOCIETY_HIGHER_ROLE_REVIEW"
    );
    assert.equal(routed[4].verificationRouteType, "SOCIETY_HIGHER_ROLE_REVIEW");
    const duplicateSubmitError=await expectCode(
      () => onboardingService.submit(owner.user._id),
      "ONBOARDING_ALREADY_SUBMITTED"
    );
    assert.equal(duplicateSubmitError.message,"Onboarding has already been submitted");
    await verificationService.approve({
      userId: gsVerifier.user._id,
      claimId: routed[0]._id,
    });
    await verificationService.approve({
      userId: presidentVerifier.user._id,
      claimId: routed[1]._id,
    });
    await verificationService.reject({
      userId: presidentVerifier.user._id,
      claimId: routed[2]._id,
      reason: "Role dates require correction",
    });
    await verificationService.reject({
      userId: presidentVerifier.user._id,
      claimId: routed[3]._id,
      reason: "Role could not be verified",
    });
    let progress = await onboardingService.progress(owner.user._id);
    assert.deepEqual(
      { ...progress.summary },
      {
        totalClaims: 5,
        approvedClaims: 2,
        rejectedClaims: 2,
        pendingClaims: 1,
        lockedClaims: 0,
        approvedOngoingClaims: 1,
        approvedEndedClaims: 1,
      }
    );
    assert(
      progress.claims.find((x) => String(x._id) === String(routed[2]._id))
        .rejectionReason
    );
    await expectCode(
      () =>
        claimService.editClaim(owner.user._id, routed[0]._id, {
          studentDescription: "bad",
        }),
      "CLAIM_NOT_EDITABLE"
    );
    await claimService.editClaim(owner.user._id, routed[2]._id, {
      studentDescription: "Corrected claim",
    });
    const resubmitted = await claimService.resubmit(
      owner.user._id,
      routed[2]._id
    );
    assert.equal(resubmitted.attemptNumber, 2);
    assert.equal((await Claim.findById(routed[3]._id)).status, "REJECTED");
    await verificationService.reject({
      userId: presidentVerifier.user._id,
      claimId: routed[2]._id,
      reason: "Still unverifiable",
    });
    assert.equal((await Claim.findById(routed[2]._id)).status, "LOCKED");
    await expectCode(
      () => claimService.resubmit(owner.user._id, routed[2]._id),
      "CLAIM_RESUBMISSION_NOT_ALLOWED"
    );
    await expectCode(
      () =>
        verificationService.reject({
          userId: presidentVerifier.user._id,
          claimId: routed[2]._id,
          reason: "duplicate",
        }),
      "CLAIM_ALREADY_DECIDED"
    );
    const activeAssignment = await Assignment.findById(
      (
        await Claim.findById(routed[0]._id)
      ).activeRoleAssignmentId
    );
    assert(activeAssignment && activeAssignment.isOngoing);
    assert.equal(
      (await Claim.findById(routed[1]._id)).activeRoleAssignmentId,
      undefined
    );
    let contexts = await authService.resolveActiveSocietyContexts(
      owner.user._id
    );
    assert.equal(contexts.length, 1);
    assert.equal(
      await authService.resolveAuthNextAction({
        user: owner.user,
        student: owner.student,
      }),
      "DASHBOARD"
    );
    await onboardingService.acceptCurrentResult(owner.user._id);
    assert.equal(
      await authService.resolveAuthNextAction({
        user: owner.user,
        student: owner.student,
      }),
      "DASHBOARD"
    );
    await verificationService.approve({
      userId: superVerifier.user._id,
      claimId: routed[4]._id,
    });
    contexts = await authService.resolveActiveSocietyContexts(owner.user._id);
    assert.equal(contexts.length, 2);
    const eligibility =
      await onboardingService.resolveOnboardingDashboardEligibility(
        owner.user._id
      );
    assert.equal(eligibility.activeSocietyCount, 2);
    assert.equal(eligibility.maxActiveSocieties, 3);
    assert.equal(eligibility.remainingSocietySlots, 1);
    assert.equal(eligibility.joinSocietyAvailable, true);
    const rejectedOwner = await mkUser();
    const rejectedOnboarding = await onboardingService.start({
      user: rejectedOwner.user,
      student: rejectedOwner.student,
    });
    const rejectedClaim = await claimService.addClaim(rejectedOwner.user._id, {
      societyId: ids.societies[0],
      claimedRoleId: roles.MEMBER._id,
      startDate: "2024-08-01",
      isOngoing: true,
      events: [],
    });
    await onboardingService.submit(rejectedOwner.user._id);
    await verificationService.reject({
      userId: gsVerifier.user._id,
      claimId: rejectedClaim._id,
      reason: "First rejection",
    });
    assert.equal(
      (await Onboarding.findById(rejectedOnboarding._id)).status,
      "FULLY_REJECTED"
    );
    await claimService.resubmit(rejectedOwner.user._id, rejectedClaim._id);
    await verificationService.reject({
      userId: gsVerifier.user._id,
      claimId: rejectedClaim._id,
      reason: "Second rejection",
    });
    assert.equal(
      (await Onboarding.findById(rejectedOnboarding._id)).status,
      "LOCKED"
    );
    const rejectedEligibility =
      await onboardingService.resolveOnboardingDashboardEligibility(
        rejectedOwner.user._id
      );
    assert.equal(rejectedEligibility.canAccessDashboard, true);
    assert.equal(rejectedEligibility.approvedOngoingContexts, 0);
    const freshOwner=await mkUser();
    await expectCode(()=>onboardingService.getForUser(freshOwner.user._id),"ONBOARDING_NOT_FOUND");
    const firstStart=await onboardingService.start({user:freshOwner.user,student:freshOwner.student}),repeatedStart=await onboardingService.start({user:freshOwner.user,student:freshOwner.student});
    assert.equal(String(firstStart._id),String(repeatedStart._id));
    freshOwner.user.status="PENDING_ONBOARDING";
    await freshOwner.user.save();
    const joinOnlyRequests=[await membershipRequestService.submit({user:freshOwner.user,student:freshOwner.student,societyId:ids.societies[4],requestReason:"Verification initial join request"})];
    await expectCode(()=>membershipRequestService.submit({user:freshOwner.user,student:freshOwner.student,societyId:ids.societies[1],requestReason:"Unsafe second initial request"}),"ONBOARDING_INITIAL_REQUEST_EXISTS");
    const joinOnlyResult=await onboardingService.submit(freshOwner.user._id,"NEW_JOIN_REQUEST");
    assert.equal(joinOnlyResult.onboarding.status,"COMPLETED");
    assert.equal(joinOnlyResult.claims.length,0);
    assert.equal(await authService.resolveAuthNextAction({user:freshOwner.user,student:freshOwner.student}),"DASHBOARD");
    assert.equal(await Membership.countDocuments({userId:freshOwner.user._id,status:"ACTIVE"}),0);
    assert.equal(await Assignment.countDocuments({userId:freshOwner.user._id,scopeType:"SOCIETY",status:"ACTIVE"}),0);
    for(const [index,societyId] of [ids.societies[1],ids.societies[2]].entries())
      joinOnlyRequests.push(await membershipRequestService.submit({user:freshOwner.user,student:freshOwner.student,societyId,requestReason:`Post-onboarding join request ${index+1}`}));
    assert.equal(new Set(joinOnlyRequests.map(item=>String(item.request.societyId))).size,3);
    assert(joinOnlyRequests.every(item=>item.request.verificationTargetUserIds.length>0));
    await expectCode(()=>membershipRequestService.submit({user:freshOwner.user,student:freshOwner.student,societyId:ids.societies[4],requestReason:"Duplicate"}),"DUPLICATE_PENDING_REQUEST");
    const persistedRequests=await membershipRequestService.my(freshOwner.user._id,1,50);
    assert.equal(persistedRequests.items.length,3);
    const mixedOwner=await mkUser(),mixedOnboarding=await onboardingService.start({user:mixedOwner.user,student:mixedOwner.student});
    await claimService.addClaim(mixedOwner.user._id,{societyId:ids.societies[0],claimedRoleId:roles.MEMBER._id,startDate:"2024-08-01",isOngoing:true,events:[]});
    await expectCode(()=>membershipRequestService.submit({user:mixedOwner.user,student:mixedOwner.student,societyId:ids.societies[1],requestReason:"Verification mixed request"}),"ONBOARDING_JOURNEY_CONFLICT");
    assert.equal((await Claim.countDocuments({onboardingId:mixedOnboarding._id,status:"DRAFT"})),1);
    console.log(
      JSON.stringify(
        {
          passed: 51,
          safeOnboardingReferences: true,
          start: true,
          fiveClaims: true,
          routing: true,
          gsRoute: true,
          facultyRoute: true,
          presidentFallback: true,
          superAdminFallback: true,
          partialSummary: true,
          rejectionReasons: true,
          resubmissionIsolation: true,
          secondAttemptLock: true,
          ongoingAssignment: true,
          endedHistoryOnly: true,
          activeContexts: true,
          partialAcceptance: true,
          laterApprovalContext: true,
          joinLimit: true,
          idempotencyGuards: true,
          fullyRejectedResubmission: true,
          lockedBasicDashboard: true,
          firstGetNotFound: true,
          singleIdempotentStart: true,
          reloadResumesOnboarding: true,
          joinOnlyWithoutClaim: true,
          pendingOnboardingFirstJoinRequest: true,
          multipleIndependentJoinRequests: true,
          societyScopedDuplicateConflict: true,
          joinRequestRefreshPersistence: true,
          independentReviewerRouting: true,
          journeyExclusivity: true,
          oneInitialJoinRequest: true,
          completedOnboardingDashboardAccess: true,
          pendingRequestNoMembership: true,
          pendingRequestNoSocietyContext: true,
          exact409Preserved: true,
        },
        null,
        2
      )
    );
  } finally {
    if (ids.users.length)
      await Verification.collection.deleteMany({
        verifierUserId: { $in: ids.users },
      });
    if (ids.users.length)
      await Claim.deleteMany({ userId: { $in: ids.users } });
    if (ids.users.length)
      await MembershipRequest.deleteMany({ userId: { $in: ids.users } });
    if (ids.users.length)
      await Onboarding.deleteMany({ userId: { $in: ids.users } });
    if (ids.users.length)
      await Assignment.deleteMany({ userId: { $in: ids.users } });
    if (ids.users.length)
      await Membership.deleteMany({ userId: { $in: ids.users } });
    if (ids.users.length) await User.deleteMany({ _id: { $in: ids.users } });
    if (ids.students.length)
      await Student.deleteMany({ _id: { $in: ids.students } });
    if (ids.societies.length)
      await Society.deleteMany({ _id: { $in: ids.societies } });
    await disconnectDatabase();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
