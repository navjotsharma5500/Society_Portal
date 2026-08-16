const tokens = require("../modules/auth/token.service");
const Session = require("../modules/auth/session.model");
const User = require("../modules/users/user.model");
const { COOKIE_NAMES } = require("../modules/auth/auth.constants");

const cookies = (header="") => Object.fromEntries(header.split(";").map((part)=>part.trim().split("=")).filter(([key])=>key).map(([key,value])=>[key,decodeURIComponent(value||"")]));
module.exports = async (socket,next) => {
  try {
    const raw=cookies(socket.handshake.headers.cookie)[COOKIE_NAMES.ACCESS];if(!raw)return next(new Error("AUTHENTICATION_REQUIRED"));
    const payload=tokens.verifyAccessToken(raw),[session,user]=await Promise.all([Session.findById(payload.sessionId).lean(),User.findById(payload.userId).select("accountType status isLoginAllowed").lean()]);
    if(!session||String(session.userId)!==String(payload.userId)||session.status!=="ACTIVE"||session.expiresAt<=new Date())return next(new Error("SESSION_REVOKED"));
    if(!user||["INACTIVE","SUSPENDED"].includes(user.status)||!user.isLoginAllowed)return next(new Error("ACCOUNT_INACTIVE"));
    socket.data.userId=String(user._id);socket.data.sessionId=String(session._id);socket.data.accountType=user.accountType;next();
  } catch (_) { next(new Error("SESSION_EXPIRED")); }
};
