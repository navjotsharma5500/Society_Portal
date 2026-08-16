import { Bell, Building2, CalendarDays, ClipboardCheck, GraduationCap, House, UserRound, WalletCards } from "lucide-react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { useCapability } from "../../rbac/hooks/useCapability";
import "../workspace.css";

const definitions = {
  ADOSA: { base: "/adosa", title: "ADoSA", subtitle: "Administrative Workspace" },
  ADMIN: { base: "/admin-workspace", title: "DoSA", subtitle: "Institutional Administration" },
};
const links = [
  ["Dashboard", "dashboard", House, "dashboard.admin.view"],
  ["Approvals", "approvals", ClipboardCheck, "verification.queue.view"],
  ["Events", "events", CalendarDays, "event.page.view"],
  ["Societies", "societies", Building2, "society.page.view"],
  ["Students", "students", GraduationCap, "student.page.view"],
  ["Budgets", "budgets", WalletCards, "budget.page.view"],
  ["Notifications", "notifications", Bell, "notification.page.view"],
  ["Profile", "profile", UserRound, null],
];
export default function AdministrativeWorkspaceLayout({ roleCode }) {
  const { dashboardContexts } = useAuth(), can = useCapability(), location = useLocation(), definition = definitions[roleCode];
  if (!dashboardContexts.some((context) => context.type === "GLOBAL" && context.roleCode === roleCode)) return <Navigate to="/portal" replace />;
  const items = links.filter(([, , , permission]) => !permission || can(permission));
  return <div className="administrative-shell"><aside><h2>{definition.title}</h2><small>{definition.subtitle}</small><nav>{items.map(([label, path, Icon]) => <NavLink key={path} to={`${definition.base}/${path}`}><Icon size={18}/>{label}</NavLink>)}</nav></aside><section><header><b>{definition.title} / {items.find(([, path]) => location.pathname.includes(`/${path}`))?.[0] || "Dashboard"}</b></header><main><Outlet/></main></section></div>;
}
