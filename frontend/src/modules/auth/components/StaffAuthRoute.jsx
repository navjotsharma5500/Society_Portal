import { Navigate } from "react-router-dom";
import { Spinner } from "../../../design-system";
import { useAuth } from "../hooks/useAuth";
export default function StaffAuthRoute({ children }) {
  const { authStatus, isAuthenticated, isStudent, accessDisabled } = useAuth();
  if (authStatus === "INITIALIZING")
    return (
      <div className="auth-route-loading">
        <Spinner />
        <span>Loading portal…</span>
      </div>
    );
  if (accessDisabled)
    return (
      <Navigate
        to="/access-disabled"
        replace
        state={{ loginPath: "/staff-login" }}
      />
    );
  if (!isAuthenticated) return <Navigate to="/staff-login" replace />;
  if (isStudent) return <Navigate to="/student/dashboard" replace />;
  return children;
}
