import {
  Bell,
  CalendarDays,
  House,
  Menu,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import ContextSwitcher from "../components/ContextSwitcher";
const items = [
  ["Home", "", House],
  ["Approvals", "approvals", ShieldCheck],
  ["Members", "members", UsersRound],
  ["Events", "events", CalendarDays],
  ["Notifications", "notifications", Bell],
  ["Profile", "profile", UserRound],
];
export default function SocietyAdminLayout() {
  const { societyId } = useParams(),
    { dashboardContexts, activeDashboardContext, setActiveDashboardContext } =
      useAuth(),
    navigate = useNavigate(),
    matching = dashboardContexts.find(
      (x) => x.type === "SOCIETY" && String(x.societyId) === String(societyId)
    );
  useEffect(() => {
    if (matching && activeDashboardContext?.id !== matching.id)
      setActiveDashboardContext(matching);
  }, [matching, activeDashboardContext?.id, setActiveDashboardContext]);
  if (!matching)
    return (
      <main className="portal-selector">
        <p>This society workspace is not assigned to your account.</p>
      </main>
    );
  return (
    <div className="society-shell">
      <aside>
        <h2>{matching.societyName}</h2>
        <small>{matching.roleName}</small>
        <nav>
          {items.map(([label, path, Icon]) => (
            <NavLink
              end={!path}
              key={label}
              to={`/society-admin/${societyId}${path ? `/${path}` : ""}`}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section>
        <header>
          <button className="mobile-only icon-button" aria-label="Navigation">
            <Menu />
          </button>
          <ContextSwitcher />
          <button
            className="button button-ghost"
            onClick={() => {
              setActiveDashboardContext(null);
              navigate("/portal");
            }}
          >
            All workspaces
          </button>
        </header>
        <main>
          <Outlet />
        </main>
      </section>
    </div>
  );
}
