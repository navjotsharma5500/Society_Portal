const crypto = require("node:crypto");
const AppError = require("../../common/errors/AppError"),
  environment = require("../../config/environment"),
  repo = require("./session.repository"),
  tokens = require("./token.service"),
  events = require("../../common/events/domainEvent.service");
const expiry = () =>
  new Date(Date.now() + environment.refreshTokenTtlDays * 86400000);
const clientData = (req) => ({
  deviceId: req?.body?.deviceId,
  deviceName: req?.body?.deviceName,
  userAgent: req?.get?.("user-agent"),
  ipAddress: req?.ip,
});
const createSession = async (user, req, tokenFamily = crypto.randomUUID()) => {
  const refreshToken = tokens.randomToken();
  const session = await repo.create({
    userId: user._id,
    refreshTokenHash: tokens.hashRefreshToken(refreshToken),
    tokenFamily,
    expiresAt: expiry(),
    lastUsedAt: new Date(),
    ...clientData(req),
  });
  return {
    session,
    refreshToken,
    accessToken: tokens.signAccessToken({
      userId: user._id,
      sessionId: session._id,
      accountType: user.accountType,
    }),
  };
};
const rotate = async (rawToken, req) => {
  if (!rawToken)
    throw new AppError(
      "Refresh session is required",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  const old = await repo.findByHash(tokens.hashRefreshToken(rawToken));
  if (!old)
    throw new AppError("Refresh session is invalid", 401, "SESSION_REVOKED");
  if (old.status === "ROTATED") {
    await repo.revokeFamily(old.tokenFamily, "REFRESH_TOKEN_REUSE_DETECTED");
    throw new AppError(
      "Refresh token reuse detected",
      401,
      "REFRESH_TOKEN_REUSE_DETECTED"
    );
  }
  if (old.status !== "ACTIVE")
    throw new AppError("Session has been revoked", 401, "SESSION_REVOKED");
  if (old.expiresAt <= new Date()) {
    await repo.update(old._id, { status: "EXPIRED" });
    throw new AppError("Session has expired", 401, "SESSION_EXPIRED");
  }
  const User = require("../users/user.model");
  const user = await User.findById(old.userId);
  if (
    !user ||
    !user.isLoginAllowed ||
    ["INACTIVE", "SUSPENDED"].includes(user.status)
  ) {
    await repo.revokeFamily(old.tokenFamily, "LOGIN_ACCESS_DISABLED");
    throw new AppError(
      "Login access is disabled",
      403,
      "LOGIN_ACCESS_DISABLED"
    );
  }
  if (user.accountType === "STUDENT") {
    const Student = require("../studentMaster/studentMaster.model");
    const student = user.studentMasterId
      ? await Student.findById(user.studentMasterId)
      : null;
    if (!student) {
      await repo.revokeFamily(old.tokenFamily, "STUDENT_MASTER_NOT_FOUND");
      throw new AppError(
        "Student master record is missing",
        403,
        "STUDENT_MASTER_NOT_FOUND"
      );
    }
    if (!student.isLoginAllowed || student.recordStatus !== "ACTIVE") {
      await repo.revokeFamily(old.tokenFamily, "STUDENT_RECORD_INACTIVE");
      throw new AppError(
        "Student login is disabled",
        403,
        student.isLoginAllowed
          ? "STUDENT_RECORD_INACTIVE"
          : "LOGIN_ACCESS_DISABLED"
      );
    }
  }
  const claimed = await repo.claimRotation(old._id);
  if (!claimed) {
    await repo.revokeFamily(old.tokenFamily, "REFRESH_TOKEN_REUSE_DETECTED");
    throw new AppError(
      "Refresh token reuse detected",
      401,
      "REFRESH_TOKEN_REUSE_DETECTED"
    );
  }
  let created;
  try {
    created = await createSession(user, req, old.tokenFamily);
  } catch (error) {
    await repo.revokeFamily(old.tokenFamily, "REFRESH_ROTATION_FAILED");
    throw error;
  }
  await repo.update(old._id, {
    replacedBySessionId: created.session._id,
  });
  return { ...created, user };
};
const revokeSession = async (sessionId, userId, reason = "LOGOUT") => {
  const session = await repo.findById(sessionId);
  if (!session || String(session.userId) !== String(userId))
    throw new AppError("Session not found", 404, "SESSION_REVOKED");
  if (session.status === "ACTIVE")
    await repo.update(session._id, {
      status: "REVOKED",
      revokedAt: new Date(),
      revocationReason: reason,
    });
  events.publish("AUTH_LOGOUT", {
    userId,
    metadata: { sessionId: String(sessionId) },
  });
};
const revokeAllForUser = async (
  userId,
  reason = "AUTH_ALL_SESSIONS_REVOKED"
) => {
  const result = await repo.revokeAll(userId, reason);
  events.publish("AUTH_ALL_SESSIONS_REVOKED", {
    userId,
    metadata: { reason, revokedCount: result.modifiedCount },
  });
  return result;
};
module.exports = {
  createSession,
  rotate,
  revokeSession,
  revokeAllForUser,
  listActive: repo.listActive,
};
