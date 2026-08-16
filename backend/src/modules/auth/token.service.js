const crypto = require("node:crypto"),
  jwt = require("jsonwebtoken"),
  environment = require("../../config/environment");
const randomToken = () => crypto.randomBytes(48).toString("base64url");
const hashRefreshToken = (token) =>
  crypto
    .createHash("sha256")
    .update(`${token}:${environment.jwtRefreshSecret}`)
    .digest("hex");
const signAccessToken = ({ userId, sessionId, accountType }) =>
  jwt.sign(
    { userId: String(userId), sessionId: String(sessionId), accountType },
    environment.jwtAccessSecret,
    {
      expiresIn: `${environment.accessTokenTtlMinutes}m`,
      issuer: "tiet-society-portal",
      audience: "tiet-society-portal-api",
    }
  );
const verifyAccessToken = (token) =>
  jwt.verify(token, environment.jwtAccessSecret, {
    issuer: "tiet-society-portal",
    audience: "tiet-society-portal-api",
  });
module.exports = {
  randomToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
};
