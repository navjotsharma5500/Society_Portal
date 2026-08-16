import { Navigate, useLocation } from "react-router-dom";
import { Spinner } from "../../../design-system";
import { useAuth } from "../hooks/useAuth";
export default function StudentAuthRoute({ children }) {
  const { authStatus, isAuthenticated, accessDisabled } = useAuth(),
    location = useLocation();
  if (authStatus === "INITIALIZING")
    return (
      <main className="auth-route-loading">
        <Spinner label="Restoring your session" />
        <p>Restoring your session…</p>
      </main>
    );
  if (accessDisabled)
    return (
      <Navigate
        to="/access-disabled"
        replace
        state={{ loginPath: "/student-login" }}
      />
    );
  if (!isAuthenticated)
    return (
      <Navigate
        to="/student-login"
        replace
        state={{ from: location.pathname }}
      />
    );
  return children;
}
