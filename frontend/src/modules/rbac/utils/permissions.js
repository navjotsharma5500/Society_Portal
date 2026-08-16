export const capabilitySet = ({ permissions = [], uiCapabilities = null } = {}) => new Set([
  ...permissions.filter((item) => typeof item === "string" || item.effect !== "DENY").map((item) => typeof item === "string" ? item : item.code),
  ...(uiCapabilities?.permissionCodes || []),
  ...(uiCapabilities?.uiKeys || []),
]);
export const hasCapability = (auth, code) => Boolean(auth?.user) && capabilitySet(auth).has(code);
export const filterNavigation = (items, can) => items.filter((item) => !item.permissionKey || can(item.permissionKey));
export const treeSelectionState = (ids, selected) => ({
  checked: ids.length > 0 && ids.every((id) => selected.has(id)),
  indeterminate: ids.some((id) => selected.has(id)) && !ids.every((id) => selected.has(id)),
});
