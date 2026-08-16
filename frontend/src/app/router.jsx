import { createBrowserRouter, Navigate } from "react-router-dom";
import SuperAdminLayout from "../layouts/SuperAdminLayout";
import SuperAdminHomePage from "../modules/dashboard/pages/SuperAdminHomePage";
import SocietyManagementPage from "../modules/societies/pages/SocietyManagementPage";
import SocietyDetailsPage from "../modules/societies/pages/SocietyDetailsPage";
import StudentManagementPage from "../modules/students/pages/StudentManagementPage";
import StudentDetailsPage from "../modules/students/pages/StudentDetailsPage";
import UserManagementPage from "../modules/rbac/pages/UserManagementPage";
import UserDetailsPage from "../modules/rbac/pages/UserDetailsPage";
import RoleManagementPage from "../modules/rbac/pages/RoleManagementPage";
import RoleDetailsPage from "../modules/rbac/pages/RoleDetailsPage";
import PermissionsPage from "../modules/rbac/pages/PermissionsPage";
import NotFoundPage from "../components/common/NotFoundPage";
import DesignSystemShowcase from "../design-system/DesignSystemShowcase";
import "../design-system/showcase.css";
import StudentLoginPage from "../modules/auth/pages/StudentLoginPage";
import StudentAuthRoute from "../modules/auth/components/StudentAuthRoute";
import GuestOnlyRoute from "../modules/auth/components/GuestOnlyRoute";
import StudentOnboardingPage from "../modules/onboarding/pages/StudentOnboardingPage";
import UndertakingManagementPage from "../modules/undertakings/pages/UndertakingManagementPage";
import MandatoryUndertakingGate from "../modules/undertakings/components/MandatoryUndertakingGate";
import StaffLoginPage from "../modules/auth/pages/StaffLoginPage";
import StaffAuthRoute from "../modules/auth/components/StaffAuthRoute";
import PortalPage from "../modules/portal/pages/PortalPage";
import UnsupportedContextPage from "../modules/portal/pages/UnsupportedContextPage";
import SocietyAdminLayout from "../modules/portal/layouts/SocietyAdminLayout";
import SocietyAdminHomePage from "../modules/portal/pages/SocietyAdminHomePage";
import SocietyPlaceholderPage from "../modules/portal/pages/SocietyPlaceholderPage";
import ApprovalCenterPage from "../modules/approvals/pages/ApprovalCenterPage";
import StudentVerificationPage from "../modules/auth/pages/StudentVerificationPage";
import StudentPortalLayout from "../modules/auth/layouts/StudentPortalLayout";
import StudentHomePage from "../modules/auth/pages/StudentHomePage";
import StudentRequestsPage from "../modules/auth/pages/StudentRequestsPage";
import StudentSocietiesPage from "../modules/auth/pages/StudentSocietiesPage";
import StudentPortalPlaceholder from "../modules/auth/pages/StudentPortalPlaceholder";
import JoinRequestEditPage from "../modules/onboarding/pages/JoinRequestEditPage";
import ClaimCorrectionPage from "../modules/onboarding/pages/ClaimCorrectionPage";
import SocietyMembersPage from "../modules/portal/pages/SocietyMembersPage";
import {
  EventDetailPage,
  EventEditorPage,
  SocietyEventsPage,
} from "../modules/events/pages/EventPages";
import RootRoute from "../modules/auth/components/RootRoute";
import AccessDisabledPage from "../modules/auth/pages/AccessDisabledPage";
import SocietyAdminEventsPage from "../modules/events/pages/SocietyAdminEventsPage";
import ReviewerEventDetailPage from "../modules/events/pages/ReviewerEventDetailPage";
import AssistantLayout from "../modules/portal/layouts/AssistantLayout";
import {
  AssistantEventsPage,
  AssistantHomePage,
  AssistantPlaceholderPage,
} from "../modules/events/pages/AssistantEventPages";
import DosaStaffLayout from "../modules/portal/layouts/DosaStaffLayout";
import { DosaStaffEventsPage, DosaStaffHomePage, DosaStaffPlaceholderPage } from "../modules/events/pages/DosaStaffEventPages";
import AdminSettingsPage from "../modules/settings/pages/AdminSettingsPage";
import AdminBudgetsPage from "../modules/budgets/pages/AdminBudgetsPage";
import AdministrativeWorkspaceLayout from "../modules/administration/layouts/AdministrativeWorkspaceLayout";
import { EventBrowserPage, EventDetailsPage as AdministrativeEventDetailsPage, SocietyBrowserPage, SocietyReadPage, StudentBrowserPage, StudentReadPage, WorkspaceDashboardPage, WorkspaceUnavailablePage } from "../modules/administration/pages/WorkspacePages";
import ProfilePage from "../modules/profile/pages/ProfilePage";
const guestLogin = (
    <GuestOnlyRoute>
      <StudentLoginPage />
    </GuestOnlyRoute>
  ),
  protectedStudentPortal = (
    <StudentAuthRoute>
      <MandatoryUndertakingGate>
        <StudentPortalLayout />
      </MandatoryUndertakingGate>
    </StudentAuthRoute>
  ),
  protectedOnboarding = (
    <StudentAuthRoute>
      <StudentOnboardingPage />
    </StudentAuthRoute>
  ),
  staffLogin = (
    <GuestOnlyRoute>
      <StaffLoginPage />
    </GuestOnlyRoute>
  ),
  staffProtected = (element) => <StaffAuthRoute>{element}</StaffAuthRoute>;
export const router = createBrowserRouter([
  { path: "/", element: <RootRoute /> },
  { path: "/access-disabled", element: <AccessDisabledPage /> },
  { path: "/student-login", element: guestLogin },
  { path: "/login/student", element: guestLogin },
  { path: "/staff-login", element: staffLogin },
  { path: "/admin-login", element: staffLogin },
  { path: "/portal", element: staffProtected(<PortalPage />) },
  {
    path: "/event-reviews/:eventId",
    element: staffProtected(<ReviewerEventDetailPage />),
  },
  {
    path: "/assistant",
    element: staffProtected(<AssistantLayout />),
    children: [
      { index: true, element: <AssistantHomePage /> },
      { path: "events", element: <AssistantEventsPage /> },
      { path: "events/:eventId", element: <ReviewerEventDetailPage /> },
      {
        path: "notifications",
        element: <AssistantPlaceholderPage title="Notifications" />,
      },
      {
        path: "profile",
        element: <ProfilePage />,
      },
    ],
  },
  {
    path: "/dosa-staff",
    element: staffProtected(<DosaStaffLayout />),
    children: [
      { index: true, element: <DosaStaffHomePage /> },
      { path: "events", element: <DosaStaffEventsPage /> },
      { path: "events/:eventId", element: <ReviewerEventDetailPage /> },
      { path: "notifications", element: <DosaStaffPlaceholderPage title="Notifications" /> },
      { path: "profile", element: <ProfilePage /> },
    ],
  },
  {
    path: "/portal/unsupported",
    element: staffProtected(<UnsupportedContextPage />),
  },
  {
    path: "/society-admin/:societyId",
    element: staffProtected(<SocietyAdminLayout />),
    children: [
      { index: true, element: <SocietyAdminHomePage /> },
      { path: "approvals", element: <ApprovalCenterPage /> },
      { path: "members", element: <SocietyMembersPage /> },
      { path: "events", element: <SocietyAdminEventsPage /> },
      { path: "events/:eventId", element: <ReviewerEventDetailPage /> },
      { path: "notifications", element: <SocietyPlaceholderPage /> },
      { path: "profile", element: <ProfilePage /> },
    ],
  },
  { path: "/student/onboarding", element: protectedOnboarding },
  {
    path: "/student/onboarding/correction/:claimId",
    element: (
      <StudentAuthRoute>
        <ClaimCorrectionPage />
      </StudentAuthRoute>
    ),
  },
  {
    path: "/student/verification",
    element: (
      <StudentAuthRoute>
        <StudentVerificationPage />
      </StudentAuthRoute>
    ),
  },
  {
    path: "/student",
    element: protectedStudentPortal,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: "dashboard", element: <StudentHomePage /> },
      { path: "societies", element: <StudentSocietiesPage /> },
      { path: "requests", element: <StudentRequestsPage /> },
      {
        path: "notifications",
        element: <StudentPortalPlaceholder title="Notifications" />,
      },
      {
        path: "profile",
        element: <ProfilePage />,
      },
      { path: "society/:societyId/approvals", element: <ApprovalCenterPage /> },
      { path: "events", element: <SocietyEventsPage /> },
      { path: "events/new", element: <EventEditorPage /> },
      { path: "events/:eventId/edit", element: <EventEditorPage /> },
      { path: "events/:eventId/review", element: <EventDetailPage review /> },
      { path: "events/:eventId", element: <EventDetailPage /> },
    ],
  },
  {
    path: "/student/join-request/:id/edit",
    element: (
      <StudentAuthRoute>
        <JoinRequestEditPage />
      </StudentAuthRoute>
    ),
  },
  {
    path: "/adosa",
    element: staffProtected(<AdministrativeWorkspaceLayout roleCode="ADOSA" />),
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: "dashboard", element: <WorkspaceDashboardPage title="ADoSA" /> },
      { path: "approvals", element: <ApprovalCenterPage /> },
      { path: "events", element: <EventBrowserPage basePath="/adosa/events" title="ADoSA Events" /> },
      { path: "events/:eventId", element: <AdministrativeEventDetailsPage /> },
      { path: "societies", element: <SocietyBrowserPage basePath="/adosa/societies" /> },
      { path: "societies/:societyId", element: <SocietyReadPage /> },
      { path: "students", element: <StudentBrowserPage basePath="/adosa/students" /> },
      { path: "students/:studentId", element: <StudentReadPage /> },
      { path: "notifications", element: <WorkspaceUnavailablePage title="Notifications" description="The shared notification delivery API is not available yet; no separate notification store was created." /> },
      { path: "profile", element: <ProfilePage /> },
    ],
  },
  {
    path: "/admin-workspace",
    element: staffProtected(<AdministrativeWorkspaceLayout roleCode="ADMIN" />),
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: "dashboard", element: <WorkspaceDashboardPage title="DoSA" /> },
      { path: "approvals", element: <ApprovalCenterPage /> },
      { path: "events", element: <EventBrowserPage basePath="/admin-workspace/events" title="DoSA Events" /> },
      { path: "events/:eventId", element: <AdministrativeEventDetailsPage /> },
      { path: "societies", element: <SocietyBrowserPage basePath="/admin-workspace/societies" /> },
      { path: "societies/:societyId", element: <SocietyReadPage /> },
      { path: "students", element: <StudentBrowserPage basePath="/admin-workspace/students" /> },
      { path: "students/:studentId", element: <StudentReadPage /> },
      { path: "budgets", element: <AdminBudgetsPage /> },
      { path: "notifications", element: <WorkspaceUnavailablePage title="Notifications" description="The shared notification delivery API is not available yet; no separate notification store was created." /> },
      { path: "profile", element: <ProfilePage /> },
    ],
  },
  {
    path: "/admin",
    element: staffProtected(<SuperAdminLayout />),
    children: [
      { index: true, element: <SuperAdminHomePage /> },
      { path: "design-system", element: <DesignSystemShowcase /> },
      { path: "societies", element: <SocietyManagementPage /> },
      { path: "societies/:societyId", element: <SocietyDetailsPage /> },
      { path: "students", element: <StudentManagementPage /> },
      { path: "students/:studentId", element: <StudentDetailsPage /> },
      { path: "users", element: <UserManagementPage /> },
      { path: "users/:userId", element: <UserDetailsPage /> },
      { path: "roles", element: <RoleManagementPage /> },
      { path: "roles/:roleId", element: <RoleDetailsPage /> },
      { path: "permissions", element: <PermissionsPage /> },
      { path: "undertakings", element: <UndertakingManagementPage /> },
      { path: "approvals", element: <ApprovalCenterPage /> },
      { path: "settings", element: <AdminSettingsPage /> },
      { path: "budgets", element: <AdminBudgetsPage /> },
      { path: "events", element: <EventBrowserPage basePath="/admin/events" title="All Events" /> },
      { path: "events/:eventId", element: <AdministrativeEventDetailsPage /> },
      { path: "profile", element: <ProfilePage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
