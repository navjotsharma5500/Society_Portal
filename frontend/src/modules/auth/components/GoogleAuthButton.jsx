import { useEffect, useMemo, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { useGoogleIdentity } from "./GoogleAuthProviderBoundary.jsx";

export default function GoogleAuthButton({
  label,
  intent = "signin",
  configured,
  onCredential,
  disabled,
  onError,
}) {
  const buttonRef = useRef(null),
    google = useGoogleIdentity(),
    handler = useMemo(
      () => ({
        onCredential,
        onError,
      }),
      [onCredential, onError]
    );

  useEffect(() => {
    if (!configured || disabled || !google.ready) return undefined;
    return google.setCredentialHandler(handler);
  }, [configured, disabled, google, handler]);

  useEffect(() => {
    if (!configured || disabled || !google.ready) return undefined;
    google.renderButton(
      buttonRef.current,
      {
        text: intent === "signup" ? "signup_with" : "signin_with",
        shape: "rectangular",
        size: "large",
        width: "340",
      },
      handler
    );
    return () => {
      if (buttonRef.current) buttonRef.current.innerHTML = "";
    };
  }, [configured, disabled, google, handler, intent]);

  if (!configured)
    return (
      <button
        type="button"
        className="google-auth-disabled"
        disabled
        aria-label={`${label}. Google Sign-In is not configured.`}
      >
        <span aria-hidden="true">G</span>
        {label}
      </button>
    );

  return (
    <div className={`google-auth-control ${disabled ? "is-disabled" : ""}`} aria-busy={disabled || !google.ready}>
      {disabled || !google.ready ? (
        <button className="google-auth-loading" disabled>
          <LoaderCircle className="ds-spin" size={17} />
          {label}
        </button>
      ) : (
        <div ref={buttonRef} aria-label={label} />
      )}
    </div>
  );
}
