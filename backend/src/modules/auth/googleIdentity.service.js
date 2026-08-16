const { OAuth2Client } = require("google-auth-library");
const AppError = require("../../common/errors/AppError");
const environment = require("../../config/environment");
const client = new OAuth2Client(environment.googleClientId);
let verifier = null;
const normalize = (payload) => {
  if (!payload?.email_verified)
    throw new AppError(
      "Google email is not verified",
      401,
      "GOOGLE_EMAIL_NOT_VERIFIED"
    );
  if (!payload.sub || !payload.email)
    throw new AppError(
      "Google identity is incomplete",
      401,
      "GOOGLE_TOKEN_INVALID"
    );
  return {
    sub: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    name: payload.name || null,
    picture: payload.picture || null,
  };
};
const verify = async (idToken) => {
  try {
    const payload = verifier
      ? await verifier(idToken)
      : (
          await client.verifyIdToken({
            idToken,
            audience: environment.googleClientId,
          })
        ).getPayload();
    return normalize(payload);
  } catch (e) {
    if (e.isOperational) throw e;
    throw new AppError(
      "Google token is invalid or expired",
      401,
      "GOOGLE_TOKEN_INVALID"
    );
  }
};
const setDevelopmentVerifier = (fn) => {
  if (environment.nodeEnv === "production")
    throw new Error("Mock Google verification is forbidden in production");
  verifier = fn;
};
const resetDevelopmentVerifier = () => {
  verifier = null;
};
module.exports = { verify, setDevelopmentVerifier, resetDevelopmentVerifier };
