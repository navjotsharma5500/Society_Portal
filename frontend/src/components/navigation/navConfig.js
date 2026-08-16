import {
  Bell,
  Building2,
  CalendarDays,
  CircleUserRound,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  House,
  ShieldCheck,
  Users,
  Settings,
  WalletCards,
} from "lucide-react";
import { STUDENT_PERMISSIONS } from "../../modules/students/utils/studentPermissions";
export const navigationItems = [
  { label: "Home", to: "/admin", icon: House, permissionKey: "dashboard.super_admin.view" },
  { label: "Societies", to: "/admin/societies", icon: Building2, permissionKey: "society.page.view" },
  {
    label: "Students",
    to: "/admin/students",
    icon: GraduationCap,
    permissionKey: STUDENT_PERMISSIONS.pageView,
  },
  {
    label: "Users",
    to: "/admin/users",
    icon: Users,
    permissionKey: "user.page.view",
  },
  {
    label: "Roles & Permissions",
    to: "/admin/roles",
    icon: ShieldCheck,
    permissionKey: "role.page.view",
  },
  {
    label: "Undertakings",
    to: "/admin/undertakings",
    icon: FileCheck2,
    permissionKey: "undertaking.page.view",
  },
  { label: "Approvals", to: "/admin/approvals", icon: ClipboardCheck, permissionKey:"verification.queue.view" },
  { label: "Events", to: "/admin/events", icon: CalendarDays, permissionKey: "event.page.view" },
  { label: "Budget", to: "/admin/budgets", icon: WalletCards, permissionKey: "budget.view" },
  { label: "Settings", to: "/admin/settings", icon: Settings, permissionKey: "settings.view" },
  { label: "Notifications", icon: Bell },
  { label: "Profile", to: "/admin/profile", icon: CircleUserRound },
];
