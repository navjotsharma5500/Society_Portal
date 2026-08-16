const Session = require("./session.model");
const create = (data) => Session.create(data);
const findById = (id) => Session.findById(id);
const findByHash = (hash) => Session.findOne({ refreshTokenHash: hash });
const listActive = (userId) =>
  Session.find({ userId, status: "ACTIVE", expiresAt: { $gt: new Date() } })
    .select(
      "_id deviceId deviceName userAgent ipAddress expiresAt lastUsedAt status createdAt"
    )
    .sort({ createdAt: -1 });
const update = (id, data) =>
  Session.findByIdAndUpdate(
    id,
    { $set: data },
    { returnDocument: "after", runValidators: true }
  );
const claimRotation = (id) =>
  Session.findOneAndUpdate(
    { _id: id, status: "ACTIVE" },
    { $set: { status: "ROTATED", lastUsedAt: new Date() } },
    { returnDocument: "after" }
  );
const revokeFamily = (family, reason) =>
  Session.updateMany(
    { tokenFamily: family, status: { $in: ["ACTIVE", "ROTATED"] } },
    {
      $set: {
        status: "REVOKED",
        revokedAt: new Date(),
        revocationReason: reason,
      },
    }
  );
const revokeAll = (userId, reason) =>
  Session.updateMany(
    { userId, status: "ACTIVE" },
    {
      $set: {
        status: "REVOKED",
        revokedAt: new Date(),
        revocationReason: reason,
      },
    }
  );
module.exports = {
  create,
  findById,
  findByHash,
  listActive,
  update,
  claimRotation,
  revokeFamily,
  revokeAll,
};
