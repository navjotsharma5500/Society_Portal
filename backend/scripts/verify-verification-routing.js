process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||=
  "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||=
  "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict"),
  { connectDatabase, disconnectDatabase } = require("../src/config/database"),
  User = require("../src/modules/users/user.model"),
  Society = require("../src/modules/societies/society.model"),
  Role = require("../src/modules/roles/role.model"),
  Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model"),
  Permission = require("../src/modules/permissions/permission.model"),
  Mapping = require("../src/modules/rolePermissions/rolePermission.model"),
  { seedRolePermissionEngine } = require("../src/modules/authorization/rolePermissionEngineSeed.service"),
  routing = require("../src/modules/verificationRouting/verificationRouting.service");
const created = { users: [], societies: [], assignments: [], roles: [], mappings: [] };
(async () => {
  try {
    await connectDatabase();
    await seedRolePermissionEngine();
    const stamp = Date.now().toString().slice(-8),
      roles = Object.fromEntries(
        (
          await Role.find({
            code: {
              $in: [
                "MEMBER",
                "GENERAL_SECRETARY",
                "PRESIDENT",
                "VICE_PRESIDENT",
                "SUPER_ADMIN",
              ],
            },
          })
        ).map((r) => [r.code, r])
      );
    for (const code of [
      "MEMBER",
      "GENERAL_SECRETARY",
      "PRESIDENT",
      "VICE_PRESIDENT",
      "SUPER_ADMIN",
    ])
      assert(roles[code], `Missing seeded ${code}`);
    for (const suffix of ["A", "B"]) {
      const s = await Society.create({
        name: `Routing ${stamp} ${suffix}`,
        code: `R${stamp.slice(-5)}${suffix}`,
        category: "VERIFY",
        status: "ACTIVE",
        isActive: true,
      });
      created.societies.push(s._id);
    }
    const makeUser = async (type = "FACULTY", enabled = true) => {
        const u = await User.create({
          email: `routing-${stamp}-${created.users.length}@example.test`,
          displayName: "Routing Verifier",
          accountType: type,
          status: "ACTIVE",
          isLoginAllowed: enabled,
        });
        created.users.push(u._id);
        return u;
      },
      gs = await makeUser("STUDENT"),
      president = await makeUser(),
      vice = await makeUser(),
      superAdmin = await makeUser("SUPER_ADMIN"),
      disabled = await makeUser("FACULTY", false),
      wrongSocietyPresident = await makeUser();
    assert.equal(president.googleSubject, undefined);
    const add = async (user, role, scopeType, societyId, extra = {}) => {
        const a = await Assignment.create({
          userId: user._id,
          roleId: roles[role]._id,
          scopeType,
          societyId: societyId || null,
          status: "ACTIVE",
          isOngoing: true,
          ...extra,
        });
        created.assignments.push(a._id);
        return a;
      },
      gsA = await add(gs, "GENERAL_SECRETARY", "SOCIETY", created.societies[0]),
      presA = await add(
        president,
        "PRESIDENT",
        "SOCIETY",
        created.societies[0]
      ),
      vpA = await add(vice, "VICE_PRESIDENT", "SOCIETY", created.societies[0]),
      superGlobal = await add(superAdmin, "SUPER_ADMIN", "GLOBAL"),
      wrongPres = await add(
        wrongSocietyPresident,
        "PRESIDENT",
        "SOCIETY",
        created.societies[1]
      ),
      disabledPres = await add(
        disabled,
        "PRESIDENT",
        "SOCIETY",
        created.societies[0]
      );
    const resolve = (role = "MEMBER", claimantUserId) =>
      routing.resolveClaimVerifiers({
        societyId: created.societies[0],
        claimedRoleId: roles[role]._id,
        claimantUserId,
      });
    let r = await resolve();
    assert.equal(r.routeType, "SOCIETY_TEAM_REVIEW");
    assert.deepEqual(r.eligibleVerifierUserIds.map(String), [String(gs._id)]);
    await Assignment.updateOne(
      { _id: gsA._id },
      { $set: { status: "INACTIVE" } }
    );
    r = await resolve("GENERAL_SECRETARY");
    assert.equal(r.routeType, "SOCIETY_HIGHER_ROLE_REVIEW");
    assert(
      r.eligibleVerifierUserIds.some((x) => String(x) === String(president._id))
    );
    assert(
      !r.eligibleVerifierUserIds.some((x) => String(x) === String(disabled._id))
    );
    assert(
      !r.eligibleVerifierUserIds.some(
        (x) => String(x) === String(wrongPres.userId)
      )
    );
    await Assignment.updateOne(
      { _id: presA._id },
      { $set: { status: "INACTIVE" } }
    );
    r = await resolve("GENERAL_SECRETARY");
    assert.deepEqual(r.eligibleVerifierUserIds.map(String), [String(vice._id)]);
    await Assignment.updateOne(
      { _id: vpA._id },
      { $set: { status: "INACTIVE" } }
    );
    await assert.rejects(() => resolve("GENERAL_SECRETARY"), (error) => error.code === "VERIFICATION_ROUTE_UNAVAILABLE");
    await Assignment.updateOne(
      { _id: presA._id },
      {
        $set: {
          status: "ACTIVE",
          isOngoing: false,
          validFrom: new Date("2020-01-01"),
          validUntil: new Date("2020-12-31"),
        },
      }
    );
    await assert.rejects(() => resolve("GENERAL_SECRETARY"), (error) => error.code === "VERIFICATION_ROUTE_UNAVAILABLE");
    await Assignment.updateOne(
      { _id: presA._id },
      {
        $set: {
          isOngoing: true,
          validFrom: new Date(0),
          validUntil: new Date(0),
        },
      }
    );
    r = await resolve("GENERAL_SECRETARY");
    assert.equal(r.routeType, "SOCIETY_HIGHER_ROLE_REVIEW");
    assert.deepEqual(r.eligibleVerifierUserIds.map(String), [
      String(president._id),
    ]);
    await assert.rejects(() => resolve("GENERAL_SECRETARY", president._id), (error) => error.code === "VERIFICATION_ROUTE_UNAVAILABLE");
    const customRole = await Role.create({ name: "Acting Reviewer", code: `ACTING_REVIEWER_${stamp}`, category: "CUSTOM", scopeType: "SOCIETY", rank: 250, isStudentRole: true, metadata: { reviewTier: "LOWER" } });
    created.roles.push(customRole._id);
    const lowerPermission = await Permission.findOne({ code: "verification.claim.review.lower_roles" });
    const customMapping = await Mapping.create({ roleId: customRole._id, permissionId: lowerPermission._id, effect: "ALLOW", dataScope: "SOCIETY", isActive: true });
    created.mappings.push(customMapping._id);
    const acting = await makeUser("STUDENT"), actingAssignment = await Assignment.create({ userId: acting._id, roleId: customRole._id, scopeType: "SOCIETY", societyId: created.societies[1], status: "ACTIVE", isOngoing: true });
    created.assignments.push(actingAssignment._id);
    let customRoute = await routing.resolveClaimVerifiers({ societyId: created.societies[1], claimedRoleId: roles.MEMBER._id });
    assert(customRoute.eligibleVerifierUserIds.map(String).includes(String(acting._id)));
    await Mapping.updateOne({ _id: customMapping._id }, { $set: { isActive: false } });
    customRoute = await routing.resolveClaimVerifiers({ societyId: created.societies[1], claimedRoleId: roles.MEMBER._id });
    assert(!customRoute.eligibleVerifierUserIds.map(String).includes(String(acting._id)));
    await Mapping.updateOne({ _id: customMapping._id }, { $set: { isActive: true } });
    customRoute = await routing.resolveClaimVerifiers({ societyId: created.societies[1], claimedRoleId: roles.MEMBER._id });
    assert(customRoute.eligibleVerifierUserIds.map(String).includes(String(acting._id)));
    assert.equal(
      await Assignment.countDocuments({ _id: { $in: created.assignments } }),
      7
    );
    console.log(
      JSON.stringify(
        {
          passed: 15,
          gsRoute: true,
          presidentRoute: true,
          vicePresidentRoute: true,
          globalVisibilitySeparatedFromAssignment: true,
          customRolePermissionMutation: true,
          userRoleAssignmentAuthoritative: true,
          nullGoogleSubjectEligible: true,
          wrongSocietyIgnored: true,
          inactiveIgnored: true,
          expiredIgnored: true,
          disabledUserIgnored: true,
          selfVerificationPrevented: true,
          noDuplicates: true,
        },
        null,
        2
      )
    );
  } finally {
    if (created.mappings.length) await Mapping.deleteMany({ _id: { $in: created.mappings } });
    if (created.assignments.length)
      await Assignment.deleteMany({ _id: { $in: created.assignments } });
    if (created.users.length)
      await User.deleteMany({ _id: { $in: created.users } });
    if (created.societies.length)
      await Society.deleteMany({ _id: { $in: created.societies } });
    if (created.roles.length) await Role.deleteMany({ _id: { $in: created.roles } });
    await disconnectDatabase();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
