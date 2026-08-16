const GLOBAL_ADMIN_ROLES = new Set(["SUPER_ADMIN", "DOSA"]);
const SOCIETY_ROLES = new Set([
  "PRESIDENT",
  "VICE_PRESIDENT",
  "GENERAL_SECRETARY",
]);
export const routeForContext = (context) => {
  if (!context) return "/portal";
  if (context.type === "GLOBAL" && context.roleCode === "ASSISTANT")
    return "/assistant";
  if (context.type === "GLOBAL" && context.roleCode === "DOSA_STAFF")
    return "/dosa-staff";
  if (context.type === "GLOBAL" && context.roleCode === "ADMIN")
    return "/admin-workspace/dashboard";
  if (context.type === "GLOBAL" && context.roleCode === "ADOSA")
    return "/adosa/dashboard";
  if (context.type === "GLOBAL" && GLOBAL_ADMIN_ROLES.has(context.roleCode))
    return "/admin";
  if (context.type === "SOCIETY" && SOCIETY_ROLES.has(context.roleCode))
    return `/society-admin/${context.societyId}`;
  return "/portal/unsupported";
};
