const MESSAGES = Object.freeze({
  SIGNUP_REQUIRED: "Please complete Sign Up before signing in.",
  ACCOUNT_NOT_REGISTERED: "Your account is not registered for Society Portal access. Please contact the administrator.",
  LOGIN_ACCESS_DISABLED:
    "Your portal access has been disabled. Please contact the administrator.",
  ACCOUNT_SUSPENDED: "Your account is currently suspended.",
  ACCOUNT_INACTIVE:
    "Your account is currently inactive. Please contact the administrator.",
  GOOGLE_ACCOUNT_MISMATCH:
    "This Google account does not match your registered portal account.",
  NO_ACTIVE_ROLE: "No active role is assigned to your portal account.",
  STAFF_ACCOUNT_REQUIRED: "Use Student Access for this account.",
  GOOGLE_SUBJECT_ALREADY_LINKED:
    "This Google account is already linked to another portal profile.",
  GOOGLE_POPUP_CLOSED: "Google Sign-In was cancelled.",
  GOOGLE_AUTH_FAILED:
    "Google authentication could not be completed. Please try again.",
  GOOGLE_NOT_CONFIGURED:
    "Google Sign-In is not configured for this environment.",
  NETWORK_ERROR: "Unable to connect to the Society Portal. Please try again.",
  BACKEND_UNAVAILABLE:
    "The Society Portal is temporarily unavailable. Please try again shortly.",
  UNKNOWN_NEXT_ACTION:
    "We could not determine the next step for your profile. Please contact the administrator.",
});
export function getAuthErrorMessage(error) {
  const code = error?.errorCode || error?.response?.data?.error?.code;
  if (MESSAGES[code]) return MESSAGES[code];
  if (!error?.response) return MESSAGES.NETWORK_ERROR;
  if (error.response.status >= 500) return MESSAGES.BACKEND_UNAVAILABLE;
  return "Authentication could not be completed. Please try again or contact the administrator.";
}
export { MESSAGES as AUTH_ERROR_MESSAGES };
