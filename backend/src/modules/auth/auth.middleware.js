const AppError = require("../../common/errors/AppError"),
  tokens = require("./token.service"),
  Session = require("./session.model"),
  User = require("../users/user.model"),
  Student = require("../studentMaster/studentMaster.model"),
  { COOKIE_NAMES } = require("./auth.constants");
const performance = require("../../common/performance/performance");
const tokenFrom = (req) =>
  req.cookies?.[COOKIE_NAMES.ACCESS] ||
  (req.get("authorization")?.startsWith("Bearer ")
    ? req.get("authorization").slice(7)
    : null);
const authenticateSession = async (req, res, next) => {
  try {
    const authStartedAt = performance.now();
    const raw = tokenFrom(req);
    if (!raw)
      throw new AppError(
        "Authentication is required",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    let payload;
    try {
      payload = tokens.verifyAccessToken(raw);
    } catch (_) {
      throw new AppError("Session has expired", 401, "SESSION_EXPIRED");
    }
    const lookupStartedAt = performance.now();
    const [session, user] = await Promise.all([Session.findById(payload.sessionId).lean(), User.findById(payload.userId).lean()]);
    performance.mark(req, "authLookupMs", lookupStartedAt);
    if (
      !session ||
      String(session.userId) !== String(payload.userId) ||
      session.status !== "ACTIVE"
    )
      throw new AppError("Session has been revoked", 401, "SESSION_REVOKED");
    if (session.expiresAt <= new Date())
      throw new AppError("Session has expired", 401, "SESSION_EXPIRED");
    const deny=async(message,code)=>{await Session.updateOne({_id:session._id},{$set:{status:"REVOKED",revokedAt:new Date(),revocationReason:code}});throw new AppError(message,403,code)};
    if (!user) await deny("Account is inactive", "ACCOUNT_INACTIVE");
    if (user.status === "INACTIVE")
      await deny("Account is inactive","ACCOUNT_INACTIVE");
    if (user.status === "SUSPENDED")
      await deny("Account is suspended","ACCOUNT_SUSPENDED");
    if (!user.isLoginAllowed)
      await deny("Login access is disabled","LOGIN_ACCESS_DISABLED");
    let student = null;
    if (user.accountType === "STUDENT") {
      if (
        !user.studentMasterId ||
        (student = await Student.findById(user.studentMasterId)) === null
      )
        throw new AppError(
          "Student master record is missing",
          403,
          "STUDENT_MASTER_NOT_FOUND"
        );
      if (!student.isLoginAllowed)
        await deny("Student login access is disabled","LOGIN_ACCESS_DISABLED");
      if (student.recordStatus !== "ACTIVE")
        await deny("Student record is inactive","STUDENT_RECORD_INACTIVE");
    }
    req.auth = {
      userId: user._id,
      sessionId: session._id,
      accountType: user.accountType,
      user,
      student,
      session,
    };
    performance.mark(req, "authMs", authStartedAt);
    next();
  } catch (e) {
    next(e);
  }
};
module.exports = { authenticateSession };
