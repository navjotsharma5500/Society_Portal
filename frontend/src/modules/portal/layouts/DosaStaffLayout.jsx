import { Bell, CalendarDays, House, UserRound } from "lucide-react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
export default function DosaStaffLayout() {
  const { dashboardContexts } = useAuth();
  if (!dashboardContexts.some((x) => x.type === "GLOBAL" && x.roleCode === "DOSA_STAFF"))
    return <Navigate to="/portal" replace />;
  const items = [
    ["Home", "/dosa-staff", House],
    ["Events", "/dosa-staff/events", CalendarDays],
    ["Notifications", "/dosa-staff/notifications", Bell],
    ["Profile", "/dosa-staff/profile", UserRound],
  ];
  return <div className="society-shell"><aside><h2>DoSA Staff</h2><small>Event & Budget Review</small><nav>{items.map(([label, to, Icon]) => <NavLink end={to === "/dosa-staff"} key={to} to={to}><Icon size={18}/>{label}</NavLink>)}</nav></aside><section><header><b>DoSA Staff Workspace</b></header><main><Outlet/></main></section></div>;
}
