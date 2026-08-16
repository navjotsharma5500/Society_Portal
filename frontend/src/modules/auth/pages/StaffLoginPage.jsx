import { useRef, useState } from "react";
import {
  Building2,
  BriefcaseBusiness,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../../components/common/toastContext";
import TietLogo from "../../../components/branding/TietLogo";
import { isGoogleAuthConfigured } from "../../../config/environment";
import { LOGIN_BACKGROUND_URL } from "../../../config/brandAssets";
import { useAuth } from "../hooks/useAuth";
import {
  AUTH_ERROR_MESSAGES,
  getAuthErrorMessage,
} from "../utils/authErrorMessages";
import AuthFeatureCard from "../components/AuthFeatureCard";
import AuthStatusMessage from "../components/AuthStatusMessage";
import GoogleAuthButton from "../components/GoogleAuthButton";
import { routeForContext } from "../../portal/contextRouting";
import "../student-auth.css";
export default function StaffLoginPage() {
  const navigate = useNavigate(),
    { notify } = useToast(),
    auth = useAuth(),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(""),
    inFlight = useRef(false);
  const authenticate = async (token) => {
    if (!isGoogleAuthConfigured || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setMessage("");
    try {
      const result = await auth.staffSignInWithGoogle(token);
      const primaryId = result?.primaryDashboardRole?.assignmentId,
        primaryContext = result?.dashboardContexts?.find((context) => String(context.assignmentId) === String(primaryId)) || result?.dashboardContexts?.[0];
      navigate(result?.primaryDashboardRole?.role?.code === "SUPER_ADMIN" ? "/admin" : routeForContext(primaryContext), { replace: true });
    } catch (error) {
      const friendly = getAuthErrorMessage(error);
      setMessage(friendly);
      notify(friendly, "error");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };
  const googleError = (code) =>
    setMessage(
      AUTH_ERROR_MESSAGES[code] || AUTH_ERROR_MESSAGES.GOOGLE_AUTH_FAILED
    );
  return (
    <main className="student-auth-page">
      <section
        className="student-auth-brand"
        style={{ "--login-background-image": `url("${LOGIN_BACKGROUND_URL}")` }}
      >
        <div className="auth-grid-pattern" />
        <div className="auth-glow auth-glow-one" />
        <div className="auth-glow auth-glow-two" />
        <div className="auth-brand-content">
          <div className="auth-institution">
            <TietLogo size="large" />
            <div>
              <b>Society Portal</b>
              <small>Thapar Institute of Engineering &amp; Technology</small>
            </div>
          </div>
          <span className="auth-campus-label">Campus Connect</span>
          <h1>Faculty &amp; Administration Access</h1>
          <p>
            Manage society workspaces, administration and campus operations from
            one connected portal.
          </p>
          <div className="auth-features">
            <AuthFeatureCard
              icon={UsersRound}
              title="Society Leadership"
              description="Access every society workspace assigned to you."
            />
            <AuthFeatureCard
              icon={ShieldCheck}
              title="Role-Based Access"
              description="Permissions follow your current operational responsibilities."
            />
            <AuthFeatureCard
              icon={BriefcaseBusiness}
              title="Administration"
              description="Move between global and society contexts without signing in again."
            />
          </div>
          <footer>
            <span>
              <Building2 size={14} />
              Campus Connect
            </span>
            <small>Faculty and administration portal</small>
          </footer>
        </div>
      </section>
      <section className="student-auth-panel">
        <motion.div
          className="student-auth-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="auth-card-logo">
            <TietLogo size="medium" />
            <div>
              <b>Society Portal</b>
              <small>Faculty &amp; administration access</small>
            </div>
          </div>
          <div className="auth-card-heading">
            <BriefcaseBusiness size={20} />
            <h2>Faculty &amp; Administration Access</h2>
            <p>Sign in with your registered Thapar Google account.</p>
          </div>
          {!isGoogleAuthConfigured && (
            <div className="auth-config-warning">
              <TriangleAlert size={17} />
              <div>
                <b>Google Sign-In configuration required</b>
              </div>
            </div>
          )}
          <AuthStatusMessage message={message} />
          <div className="auth-action-section returning">
            <GoogleAuthButton
              configured={isGoogleAuthConfigured}
              label="Sign in with Google"
              intent="signin"
              disabled={loading}
              onCredential={authenticate}
              onError={googleError}
            />
          </div>
          <p className="auth-help">
            Your email must already be registered by a portal administrator.
          </p>
          <p className="auth-security">
            <ShieldCheck size={14} />
            Secured with Google Identity Services. Your Google password is never
            shared with the portal.
          </p>
        </motion.div>
      </section>
    </main>
  );
}
