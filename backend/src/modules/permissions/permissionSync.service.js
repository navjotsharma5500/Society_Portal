const Permission = require("./permission.model");
const { listRegisteredPermissions } = require("./permissionRegistry");

const preview = async () => {
  const registry = listRegisteredPermissions();
  const database = await Permission.find({}).select("code status").lean();
  const databaseCodes = new Set(database.map((item) => item.code));
  const registryCodes = new Set(registry.map((item) => item.code));
  return {
    registeredCount: registry.length,
    existingCount: registry.filter((item) => databaseCodes.has(item.code)).length,
    missing: registry.filter((item) => !databaseCodes.has(item.code)),
    legacy: database.filter((item) => !registryCodes.has(item.code)),
  };
};

const syncMissing = async (actorId) => {
  const before = await preview();
  if (before.missing.length) {
    await Permission.bulkWrite(
      before.missing.map((definition) => ({
        updateOne: {
          filter: { code: definition.code },
          update: { $setOnInsert: { ...definition, createdBy: actorId, updatedBy: actorId } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }
  const after = await preview();
  return { insertedCount: before.missing.length - after.missing.length, preview: after };
};

module.exports = { preview, syncMissing };
