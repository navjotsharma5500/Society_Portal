import { LockKeyhole } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, EmptyState } from "../../../design-system";
import { useAuth } from "../hooks/useAuth";

export default function AccessDisabledPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const loginPath = location.state?.loginPath || "/student-login";
  const signOut = async () => {
    try {
      await logout();
    } finally {
      navigate(loginPath, { replace: true });
    }
  };
  return (
    <main className="portal-selector">
      <EmptyState
        icon={LockKeyhole}
        title="Portal Access Disabled"
        description="Your access to the Society Portal is currently disabled. Please contact the administrator for assistance."
        action={
          <div className="student-action-row">
            <Button onClick={signOut}>Sign Out</Button>
            <Button
              variant="outline"
              onClick={() => navigate(loginPath, { replace: true })}
            >
              Back to Login
            </Button>
          </div>
        }
      />
    </main>
  );
}
