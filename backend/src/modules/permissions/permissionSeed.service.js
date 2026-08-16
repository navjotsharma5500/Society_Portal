const Permission = require("./permission.model");
const groups = {
  USER: [
    "user.page.view",
    "user.view",
    "user.create",
    "user.edit",
    "user.status.change",
    "user.login_access.change",
  ],
  USER_ROLE_ASSIGNMENT: [
    "user_role_assignment.view",
    "user_role_assignment.create",
    "user_role_assignment.edit",
    "user_role_assignment.end",
    "user_role_assignment.revoke",
  ],
  UNDERTAKING: [
    "undertaking.page.view",
    "undertaking.create",
    "undertaking.edit",
    "undertaking.activate",
    "undertaking.deactivate",
    "undertaking.acceptance.view",
  ],
  DASHBOARD: [
    "dashboard.super_admin.view",
    "dashboard.admin.view",
    "dashboard.student.view",
  ],
  SOCIETY: [
    "society.page.view",
    "society.view",
    "society.create",
    "society.edit",
    "society.status.change",
    "society.template.download",
    "society.import.preview",
    "society.import.confirm",
    "society.export.download",
  ],
  LEADERSHIP: [
    "leadership.page.view",
    "leadership.view",
    "leadership.create",
    "leadership.edit",
    "leadership.end",
    "leadership.status.change",
  ],
  BUDGET: [
    "budget.page.view",
    "budget.view",
    "budget.create",
    "budget.adjust",
    "budget.manual_adjust",
    "budget.close",
    "budget.transactions.view",
    "budget.summary.view",
    "budget.export.download",
    "budget.allocate",
    "budget.import",
  ],
  STUDENT: [
    "student.page.view",
    "student.view",
    "student.create",
    "student.edit",
    "student.status.change",
    "student.login_access.change",
    "student.template.download",
    "student.import.preview",
    "student.import.confirm",
    "student.export.download",
  ],
  PROFILE: [
    "profile.page.view",
    "profile.view",
    "profile.save",
    "profile.submit",
    "profile.verification.view",
    "profile.verification.approve",
    "profile.verification.reject",
    "profile.verification.request_changes",
    "profile.unlock.request",
    "profile.unlock.approve",
  ],
  MEMBERSHIP: [
    "membership.page.view",
    "membership.view",
    "membership.join.request",
    "membership.join.cancel",
    "membership.request.queue.view",
    "membership.request.view",
    "membership.request.approve",
    "membership.request.reject",
    "membership.request.approve_role_override",
    "membership.role.end",
    "membership.role.end_higher_role",
    "membership.role.bulk_end",
    "membership.role.restore",
    "membership.export.download",
    "membership.import.preview",
    "membership.import.confirm",
    "membership.history.view",
    "membership.remarks.edit",
  ],
  ROLE: [
    "role.page.view",
    "role.view",
    "role.create",
    "role.edit",
    "role.status.change",
    "role.permissions.manage",
    "role.assignment.manage",
  ],
  PERMISSION: [
    "permission.page.view",
    "permission.view",
    "permission.create",
    "permission.edit",
    "permission.status.change",
  ],
  NOTIFICATION: [
    "notification.page.view",
    "notification.view",
    "notification.mark_read",
    "notification.settings.manage",
  ],
  ONBOARDING: [
    "onboarding.page.view",
    "onboarding.submit",
    "onboarding.progress.view",
  ],
  VERIFICATION: [
    "verification.queue.view",
    "verification.queue.global.view",
    "verification.claim.review.higher_roles",
    "verification.claim.review.lower_roles",
    "verification.claim.view",
    "verification.claim.approve",
    "verification.claim.reject",
    "verification.claim.request_changes",
  ],
  PORTAL_SETTING: ["portal.settings.view", "portal.settings.edit"],
  SETTINGS: ["settings.view", "settings.manage_general"],
  SESSION: ["session.view", "session.create", "session.edit", "session.set_current", "session.close"],
  DEPARTMENT: ["department.view", "department.manage", "department.import"],
  INFRASTRUCTURE: ["infrastructure.view", "infrastructure.manage", "infrastructure.import"],
  EVENT: [
    "event.page.view",
    "event.create",
    "event.view",
    "event.edit_own",
    "event.submit",
    "event.list_society",
    "event.approval.queue.view",
    "event.approval.view",
    "event.approval.approve",
    "event.approval.request_changes",
    "event.approval.reject",
    "event.review.queue.view",
    "event.review.view",
    "event.review.forward",
    "event.review.amend",
    "event.review.request_changes",
    "event.review.reject",
    "event.review.final_approve",
    "event.budget_review.view",
    "event.budget_review.edit",
  ],
  VENUE: ["venue.page.view", "venue.view", "venue.request", "venue.approve"],
  NIGHT_PERMISSION: [
    "night_permission.page.view",
    "night_permission.request",
    "night_permission.approve",
  ],
  CERTIFICATE: [
    "certificate.page.view",
    "certificate.request",
    "certificate.issue",
  ],
  WORKFLOW: ["workflow.page.view", "workflow.view", "workflow.manage"],
  PROMOTION: ["promotion.request", "promotion.approve"],
};
const title = (s) =>
  s
    .split(/[._-]/)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
const category = (m) => `${title(m)} Management`;
const catalog = Object.entries(groups).flatMap(([module, codes]) =>
  codes.map((code, i) => {
    const parts = code.split("."),
      action = parts.at(-1),
      resource = parts.slice(0, -1).join(".");
    const page = action === "view" && parts.includes("page"),
      uiAction = [
        "create",
        "edit",
        "approve",
        "adjust",
        "download",
        "confirm",
        "request",
        "submit",
        "save",
        "end",
        "change",
        "issue",
        "manage",
      ].includes(action);
    return {
      code,
      name: title(code),
      module,
      resource,
      action,
      permissionType: page ? "PAGE" : uiAction ? "BUTTON" : "API",
      category:
        module === "DASHBOARD" ? "Dashboard Visibility" : category(module),
      uiKey: page
        ? `sidebar.${parts[0]}`
        : uiAction
        ? `button.${code}`
        : undefined,
      sortOrder: i,
      isSystemPermission: true,
      status: "ACTIVE",
    };
  })
);
const seedPermissions = async () => {
  let created = 0;
  for (const p of catalog) {
    const r = await Permission.updateOne(
      { code: p.code },
      { $setOnInsert: p },
      { upsert: true }
    );
    if (r.upsertedCount) created++;
  }
  return { total: catalog.length, created, existing: catalog.length - created };
};
module.exports = { seedPermissions, permissionCatalog: catalog };
