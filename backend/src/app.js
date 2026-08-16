const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const environment = require("./config/environment");
const timedRequire = (label, path) => {
  const started = process.hrtime.bigint();
  const result = require(path);
  if (environment.nodeEnv === "development") {
    const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    if (ms >= 100) console.info(`[startup] require ${label}: ${ms}ms`);
  }
  return result;
};
const healthRoutes = timedRequire("health.routes", "./modules/health/health.routes");
const societyRoutes = timedRequire("societies.routes", "./modules/societies/society.routes");
const societyImportRoutes = timedRequire("societyImports.routes", "./modules/societyImports/societyImport.routes");
const societyLeadershipRoutes = timedRequire("societyLeadership.routes", "./modules/societyLeadership/societyLeadership.routes");
const societyBudgetRoutes = timedRequire("societyBudgets.routes", "./modules/societyBudgets/societyBudget.routes");
const userRoutes = timedRequire("users.routes", "./modules/users/user.routes");
const studentMasterRoutes = timedRequire("studentMaster.routes", "./modules/studentMaster/studentMaster.routes");
const roleRoutes = timedRequire("roles.routes", "./modules/roles/role.routes");
const permissionRoutes = timedRequire("permissions.routes", "./modules/permissions/permission.routes");
const userRoleAssignmentRoutes = timedRequire("userRoleAssignments.routes", "./modules/userRoleAssignments/userRoleAssignment.routes");
const authRoutes = timedRequire("auth.routes", "./modules/auth/auth.routes");
const studentOnboardingRoutes = timedRequire("studentOnboarding.routes", "./modules/studentOnboarding/studentOnboarding.routes");
const societyClaimVerificationRoutes = timedRequire("societyClaimVerifications.routes", "./modules/societyClaimVerifications/societyClaimVerification.routes");
const portalSettingRoutes = timedRequire("portalSettings.routes", "./modules/portalSettings/portalSetting.routes");
const membershipRequestRoutes = timedRequire("membershipRequests.routes", "./modules/membershipRequests/membershipRequest.routes");
const societyMembershipRoutes = timedRequire("societyMemberships.routes", "./modules/societyMemberships/societyMembership.routes");
const membershipBulkOperationRoutes = timedRequire("membershipBulkOperations.routes", "./modules/membershipBulkOperations/membershipBulkOperation.routes");
const undertakingRoutes = timedRequire("undertakings.routes", "./modules/undertakings/undertaking.routes");
const eventRoutes = timedRequire("events.routes", "./modules/events/event.routes");
const academicSessionRoutes = timedRequire("academicSessions.routes", "./modules/academicSessions/academicSession.routes");
const departmentRoutes = timedRequire("departments.routes", "./modules/departments/department.routes");
const infrastructureRoutes = timedRequire("infrastructure.routes", "./modules/infrastructure/infrastructure.routes");
const profileRoutes = timedRequire("profile.routes", "./modules/profile/profile.routes");
const adminDashboardRoutes = timedRequire("adminDashboard.routes", "./modules/adminDashboard/adminDashboard.routes");
const bulkUpdateRoutes = timedRequire("bulkUpdates.routes", "./modules/bulkUpdates/bulkUpdate.routes");
const { requestTiming } = require("./common/performance/performance");
const notFound = require("./common/middleware/notFound.middleware");
const errorMiddleware = require("./common/middleware/error.middleware");

const app = express();

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: environment.frontendUrl,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(requestTiming);

if (environment.nodeEnv === "development") {
  app.use(morgan("dev"));
}

app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/societies", societyRoutes);
app.use("/api/v1/society-imports", societyImportRoutes);
app.use("/api/v1/society-leadership", societyLeadershipRoutes);
app.use("/api/v1/society-budgets", societyBudgetRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/student-master", studentMasterRoutes);
app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/permissions", permissionRoutes);
app.use("/api/v1/user-role-assignments", userRoleAssignmentRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/student-onboarding", studentOnboardingRoutes);
app.use("/api/v1/society-claim-verifications", societyClaimVerificationRoutes);
app.use("/api/v1/portal-settings", portalSettingRoutes);
app.use("/api/v1/membership-requests", membershipRequestRoutes);
app.use("/api/v1/society-memberships", societyMembershipRoutes);
app.use("/api/v1/membership-bulk-operations", membershipBulkOperationRoutes);
app.use("/api/v1/undertakings", undertakingRoutes);
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/academic-sessions", academicSessionRoutes);
app.use("/api/v1/departments", departmentRoutes);
app.use("/api/v1/infrastructure", infrastructureRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/admin/dashboard", adminDashboardRoutes);
app.use("/api/v1/bulk-updates", bulkUpdateRoutes);

app.use(notFound);
app.use(errorMiddleware);

module.exports = app;
