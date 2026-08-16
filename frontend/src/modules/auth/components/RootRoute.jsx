import { Navigate } from "react-router-dom";
import { Spinner } from "../../../design-system";
import { useAuth } from "../hooks/useAuth";
import { resolveNextActionRoute } from "../utils/authNextAction";
export default function RootRoute() {
  const auth = useAuth();
  if (auth.authStatus === "INITIALIZING")
    return (
      <main className="auth-route-loading">
        <Spinner label="Checking your session" />
        <p>Checking your session…</p>
      </main>
    );
  if (auth.accessDisabled) return <Navigate to="/access-disabled" replace />;
  if (!auth.isAuthenticated) return <Navigate to="/staff-login" replace />;
  if (auth.isStudent)
    return (
      <Navigate
        to={
          resolveNextActionRoute(auth.onboarding?.nextAction) ||
          "/student/dashboard"
        }
        replace
      />
    );
  return (
    <Navigate
      to={
        auth.primaryDashboardRole?.role?.code === "SUPER_ADMIN"
          ? "/admin"
          : "/portal"
      }
      replace
    />
  );
}
