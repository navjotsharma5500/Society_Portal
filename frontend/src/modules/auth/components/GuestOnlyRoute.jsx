import { Navigate } from "react-router-dom";
import { Spinner } from "../../../design-system";
import { useAuth } from "../hooks/useAuth";
import { resolveNextActionRoute } from "../utils/authNextAction";
export default function GuestOnlyRoute({ children }) {
  const { authStatus, isAuthenticated, isStaff, onboarding, primaryDashboardRole } = useAuth();
  if (authStatus === "INITIALIZING")
    return (
      <main className="auth-route-loading">
        <Spinner label="Checking your session" />
        <p>Checking your session…</p>
      </main>
    );
  if (isAuthenticated) {
    if (isStaff) return <Navigate to={primaryDashboardRole?.role?.code==='SUPER_ADMIN'?'/admin':'/portal'} replace />;
    const route = resolveNextActionRoute(onboarding?.nextAction);
    if (route) return <Navigate to={route} replace />;
  }
  return children;
}
