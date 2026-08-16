const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const environment = require("./config/environment");
const healthRoutes = require("./modules/health/health.routes");
const societyRoutes = require("./modules/societies/society.routes");
const societyImportRoutes = require("./modules/societyImports/societyImport.routes");
const societyLeadershipRoutes = require("./modules/societyLeadership/societyLeadership.routes");
const societyBudgetRoutes = require("./modules/societyBudgets/societyBudget.routes");
const userRoutes = require("./modules/users/user.routes");
const studentMasterRoutes = require("./modules/studentMaster/studentMaster.routes");
const roleRoutes = require("./modules/roles/role.routes");
const permissionRoutes = require("./modules/permissions/permission.routes");
const userRoleAssignmentRoutes = require("./modules/userRoleAssignments/userRoleAssignment.routes");
const authRoutes = require("./modules/auth/auth.routes");
const studentOnboardingRoutes = require("./modules/studentOnboarding/studentOnboarding.routes");
const societyClaimVerificationRoutes = require("./modules/societyClaimVerifications/societyClaimVerification.routes");
const portalSettingRoutes = require("./modules/portalSettings/portalSetting.routes");
const membershipRequestRoutes = require("./modules/membershipRequests/membershipRequest.routes");
const societyMembershipRoutes = require("./modules/societyMemberships/societyMembership.routes");
const membershipBulkOperationRoutes = require("./modules/membershipBulkOperations/membershipBulkOperation.routes");
const undertakingRoutes = require("./modules/undertakings/undertaking.routes");
const eventRoutes = require("./modules/events/event.routes");
const academicSessionRoutes = require("./modules/academicSessions/academicSession.routes");
const departmentRoutes = require("./modules/departments/department.routes");
const infrastructureRoutes = require("./modules/infrastructure/infrastructure.routes");
const profileRoutes = require("./modules/profile/profile.routes");
const adminDashboardRoutes = require("./modules/adminDashboard/adminDashboard.routes");
const bulkUpdateRoutes = require("./modules/bulkUpdates/bulkUpdate.routes");
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
