import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { routeForContext } from "../contextRouting";
export default function ContextSwitcher() {
  const {
      dashboardContexts,
      activeDashboardContext,
      setActiveDashboardContext,
    } = useAuth(),
    navigate = useNavigate();
  if (!dashboardContexts.length) return null;
  if (dashboardContexts.length < 2)
    return (
      <span className="portal-context-label">
        {activeDashboardContext?.label}
      </span>
    );
  return (
    <select
      className="portal-context-switcher"
      aria-label="Switch workspace"
      value={activeDashboardContext?.id || ""}
      onChange={(e) => {
        const context = dashboardContexts.find((x) => x.id === e.target.value);
        setActiveDashboardContext(context);
        navigate(routeForContext(context));
      }}
    >
      {dashboardContexts.map((x) => (
        <option key={x.id} value={x.id}>
          {x.label}
        </option>
      ))}
    </select>
  );
}
