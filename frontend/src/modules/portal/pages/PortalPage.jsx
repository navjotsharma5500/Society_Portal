import { useEffect } from "react";
import { Building2, Globe2, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, EmptyState } from "../../../design-system";
import { useAuth } from "../../auth/hooks/useAuth";
import { routeForContext } from "../contextRouting";
import "../portal.css";
export default function PortalPage() {
  const { user, dashboardContexts, setActiveDashboardContext } = useAuth(),
    navigate = useNavigate();
  useEffect(() => {
    if (dashboardContexts.length === 1) {
      setActiveDashboardContext(dashboardContexts[0]);
      navigate(routeForContext(dashboardContexts[0]), { replace: true });
    }
  }, [dashboardContexts, navigate, setActiveDashboardContext]);
  if (!dashboardContexts.length)
    return (
      <main className="portal-selector">
        <EmptyState
          icon={ShieldCheck}
          title="No Active Workspace"
          description="No active role is currently assigned to your account. Please contact the administrator."
        />
      </main>
    );
  if (dashboardContexts.length === 1)
    return <main className="portal-selector">Opening your workspace…</main>;
  return (
    <main className="portal-selector">
      <header>
        <span>Welcome, {user?.displayName}</span>
        <h1>Choose your workspace</h1>
        <p>Select the role or society workspace you want to manage.</p>
      </header>
      <div className="workspace-grid">
        {dashboardContexts.map((context) => (
          <Card className="workspace-card" key={context.id}>
            <span className="workspace-icon">
              {context.type === "GLOBAL" ? <Globe2 /> : <Building2 />}
            </span>
            <small>
              {context.type === "GLOBAL"
                ? "Global Administration"
                : context.societyCode || "Society workspace"}
            </small>
            <h2>
              {context.type === "GLOBAL"
                ? context.roleName
                : context.societyName}
            </h2>
            <p>
              {context.type === "GLOBAL" ? context.label : context.roleName}
            </p>
            <Button
              onClick={() => {
                setActiveDashboardContext(context);
                navigate(routeForContext(context));
              }}
            >
              Open Workspace
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
