const { permissionCatalog: legacyCatalog } = require("./permissionSeed.service");

const additionalDefinitions = [
  {
    code: "permission.sync",
    name: "Sync Permission Registry",
    description: "Preview and insert permissions missing from the database registry.",
    module: "PERMISSION",
    resource: "registry",
    action: "sync",
    permissionType: "ACTION",
    category: "Permission Management",
    isSystemPermission: true,
    status: "ACTIVE",
  },
];

const definitions = Object.freeze(
  [...legacyCatalog, ...additionalDefinitions].map((definition) =>
    Object.freeze({ ...definition })
  )
);

const duplicateCodes = definitions
  .map((item) => item.code)
  .filter((code, index, all) => all.indexOf(code) !== index);
if (duplicateCodes.length) {
  throw new Error(`Duplicate permission registry codes: ${[...new Set(duplicateCodes)].join(", ")}`);
}

const byCode = new Map(definitions.map((definition) => [definition.code, definition]));
const listRegisteredPermissions = () => definitions.map((definition) => ({ ...definition }));
const getRegisteredPermission = (code) => byCode.get(code) || null;

module.exports = { listRegisteredPermissions, getRegisteredPermission };
