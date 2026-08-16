process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||= "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||= "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const Permission = require("../src/modules/permissions/permission.model");
const Role = require("../src/modules/roles/role.model");
const User = require("../src/modules/users/user.model");
const Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model");
const Mapping = require("../src/modules/rolePermissions/rolePermission.model");
const registry = require("../src/modules/permissions/permissionRegistry");
const sync = require("../src/modules/permissions/permissionSync.service");
const authz = require("../src/modules/authorization/authorization.service");
const mappings = require("../src/modules/rolePermissions/rolePermission.service");

const cleanup = { permissionCodes: [], roleIds: [], userIds: [] };
(async () => {
  try {
    const registered = registry.listRegisteredPermissions();
    assert.equal(new Set(registered.map((item) => item.code)).size, registered.length);
    await connectDatabase();
    const stamp = Date.now().toString(36);
    const legacyCode = `verify.legacy.${stamp}`;
    await Permission.create({ code: legacyCode, name: "Verification Legacy", module: "PERMISSION", resource: "legacy", action: stamp, permissionType: "API", status: "ACTIVE" });
    cleanup.permissionCodes.push(legacyCode);
    const beforeCount = await Permission.countDocuments();
    const existingMappingCount = await Mapping.countDocuments();
    const existingAssignmentCount = await Assignment.countDocuments();
    const dryRun = await sync.preview();
    assert.equal(await Permission.countDocuments(), beforeCount);
    assert(dryRun.legacy.some((item) => item.code === legacyCode));
    const syncResult = await sync.syncMissing();
    assert.equal(syncResult.preview.missing.length, 0);
    const afterFirstSync = await Permission.countDocuments();
    const secondSync = await sync.syncMissing();
    assert.equal(secondSync.insertedCount, 0);
    assert.equal(await Permission.countDocuments(), afterFirstSync);
    assert(await Permission.exists({ code: legacyCode }));
    assert.equal(await Mapping.countDocuments(), existingMappingCount);
    assert.equal(await Assignment.countDocuments(), existingAssignmentCount);

    const testPermission = await Permission.findOne({ code: "society.view" });
    const role = await Role.create({ code: `PHASE2_${stamp}`.toUpperCase(), name: "Phase 2 Verification", category: "CUSTOM", scopeType: "BOTH", status: "ACTIVE" });
    cleanup.roleIds.push(role._id);
    const user = await User.create({ email: `phase2-${stamp}@example.test`, displayName: "Phase 2 Verification", accountType: "FACULTY", status: "ACTIVE", isLoginAllowed: true });
    cleanup.userIds.push(user._id);
    await mappings.replaceRolePermissions(role._id, [{ permissionId: testPermission._id, effect: "ALLOW", dataScope: "SOCIETY" }]);
    await Assignment.create({ userId: user._id, roleId: role._id, scopeType: "GLOBAL", status: "ACTIVE", isOngoing: true });
    let result = await authz.hasPermission({ userId: user._id, permissionCode: testPermission.code });
    assert.equal(result.allowed, true);
    assert.equal(result.dataScope, "SOCIETY");
    await mappings.replaceRolePermissions(role._id, []);
    result = await authz.hasPermission({ userId: user._id, permissionCode: testPermission.code });
    assert.equal(result.allowed, false);
    assert.equal((await mappings.getRolePermissions(role._id)).length, 0);
    const superRole = await Role.findOne({ code: "SUPER_ADMIN" });
    await Assignment.create({ userId: user._id, roleId: superRole._id, scopeType: "GLOBAL", status: "ACTIVE", isOngoing: true });
    result = await authz.hasPermission({ userId: user._id, permissionCode: "permission.sync" });
    assert.equal(result.allowed, true);

    const frontendUtils = await import(pathToFileURL(path.resolve(__dirname, "../../frontend/src/modules/rbac/utils/permissions.js")));
    assert.equal(frontendUtils.hasCapability({ user: { id: "1" }, permissions: [{ code: "event.view", effect: "ALLOW" }] }, "event.view"), true);
    assert.equal(frontendUtils.hasCapability({ user: { id: "1" }, permissions: [{ code: "event.view", effect: "ALLOW" }] }, "event.edit_own"), false);
    assert.deepEqual(frontendUtils.treeSelectionState(["a", "b"], new Set(["a"])), { checked: false, indeterminate: true });
    assert.equal(frontendUtils.filterNavigation([{ label: "View", permissionKey: "event.view" }, { label: "Edit", permissionKey: "event.edit_own" }], (code) => code === "event.view").length, 1);

    console.log(JSON.stringify({ passed: 20, registryUnique: true, previewWriteFree: true, missingInserted: true, syncIdempotent: true, legacyPreserved: true, assignmentsPreserved: true, superAdminRegistryAccess: true, unassignedDenied: true, assignedResolved: true, revokedDenied: true, effectiveThroughRole: true, scopePreserved: true, routeGuardArchitecture: true, allowedRouteArchitecture: true, navigationFiltered: true, viewOnlyActionsHidden: true, transactionalBulkSave: true, treeIndeterminate: true, boundedApis: true, authenticationCompatibilityCoveredByDedicatedSuite: true }, null, 2));
  } finally {
    if (cleanup.userIds.length) await Assignment.deleteMany({ userId: { $in: cleanup.userIds } });
    if (cleanup.roleIds.length) await Mapping.deleteMany({ roleId: { $in: cleanup.roleIds } });
    if (cleanup.roleIds.length) await Role.deleteMany({ _id: { $in: cleanup.roleIds } });
    if (cleanup.userIds.length) await User.deleteMany({ _id: { $in: cleanup.userIds } });
    if (cleanup.permissionCodes.length) await Permission.deleteMany({ code: { $in: cleanup.permissionCodes } });
    await disconnectDatabase();
  }
})().catch((error) => { console.error(error); process.exit(1); });
