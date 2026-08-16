const environment = require("../../config/environment"),
  service = require("./auth.service"),
  sessions = require("./session.service"),
  { AUTH_INTENTS, COOKIE_NAMES } = require("./auth.constants");
const cookieBase = {
  httpOnly: true,
  secure: environment.cookieSecure,
  sameSite: environment.cookieSameSite,
};
const setCookies = (res, issued) => {
  res.cookie(COOKIE_NAMES.ACCESS, issued.accessToken, {
    ...cookieBase,
    path: "/",
    maxAge: environment.accessTokenTtlMinutes * 60000,
  });
  res.cookie(COOKIE_NAMES.REFRESH, issued.refreshToken, {
    ...cookieBase,
    path: "/api/v1/auth",
    maxAge: environment.refreshTokenTtlDays * 86400000,
  });
};
const clearCookies = (res) => {
  res.clearCookie(COOKIE_NAMES.ACCESS, { ...cookieBase, path: "/" });
  res.clearCookie(COOKIE_NAMES.REFRESH, {
    ...cookieBase,
    path: "/api/v1/auth",
  });
};
const google = (intent) => async (req, res) => {
  const result = await service.authenticateGoogle({
    idToken: req.body.idToken,
    intent,
    req,
  });
  setCookies(res, result);
  res.json({
    success: true,
    data: {
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        accountType: result.user.accountType,
        profilePhotoUrl: result.user.profilePhotoUrl || null,
      },
      onboarding: {
        signupStatus: result.student?.signupStatus || null,
        profileStatus: result.student?.profileStatus || null,
        nextAction: result.nextAction,
      },
      session: { id: result.session.id, expiresAt: result.session.expiresAt },
    },
  });
};
const staffSignIn = async (req, res) => {
  const result = await service.authenticateStaffGoogle({
    idToken: req.body.idToken,
    req,
  });
  setCookies(res, result);
  res.json({ success: true, data: result.state });
};
const refresh = async (req, res) => {
  const result = await sessions.rotate(
    req.cookies?.[COOKIE_NAMES.REFRESH],
    req
  );
  setCookies(res, result);
  res.json({
    success: true,
    data: {
      session: { id: result.session.id, expiresAt: result.session.expiresAt },
    },
  });
};
const logout = async (req, res) => {
  await sessions.revokeSession(req.auth.sessionId, req.auth.userId, "LOGOUT");
  clearCookies(res);
  res.json({ success: true, message: "Logged out successfully" });
};
const logoutAll = async (req, res) => {
  await sessions.revokeAllForUser(req.auth.userId, "USER_LOGOUT_ALL");
  clearCookies(res);
  res.json({ success: true, message: "All sessions were revoked" });
};
const me = async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  return res.json({
    success: true,
    data: await service.getMe(req.auth.userId, req.auth.session),
  });
};
const list = async (req, res) =>
  res.json({
    success: true,
    data: { sessions: await sessions.listActive(req.auth.userId) },
  });
const remove = async (req, res) => {
  await sessions.revokeSession(
    req.params.sessionId,
    req.auth.userId,
    "USER_REVOKED_SESSION"
  );
  res.json({ success: true, message: "Session revoked" });
};
const context = async (req, res) =>
  res.json({
    success: true,
    data: await service.getSocietyContext(
      req.auth.userId,
      req.params.societyId
    ),
  });
module.exports = {
  signUp: google(AUTH_INTENTS.SIGN_UP),
  signIn: google(AUTH_INTENTS.SIGN_IN),
  staffSignIn,
  refresh,
  logout,
  logoutAll,
  me,
  list,
  remove,
  context,
};
