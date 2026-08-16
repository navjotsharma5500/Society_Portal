import { Bell, CalendarDays, House, UserRound } from "lucide-react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
export default function AssistantLayout() {
  const { dashboardContexts } = useAuth();
  if (
    !dashboardContexts.some(
      (x) => x.type === "GLOBAL" && x.roleCode === "ASSISTANT"
    )
  )
    return <Navigate to="/portal" replace />;
  const items = [
    ["Home", "/assistant", House],
    ["Events", "/assistant/events", CalendarDays],
    ["Notifications", "/assistant/notifications", Bell],
    ["Profile", "/assistant/profile", UserRound],
  ];
  return (
    <div className="society-shell">
      <aside>
        <h2>Assistant</h2>
        <small>Event Workspace</small>
        <nav>
          {items.map(([label, to, Icon]) => (
            <NavLink end={to === "/assistant"} key={to} to={to}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section>
        <header>
          <b>Assistant Workspace</b>
        </header>
        <main>
          <Outlet />
        </main>
      </section>
    </div>
  );
}
