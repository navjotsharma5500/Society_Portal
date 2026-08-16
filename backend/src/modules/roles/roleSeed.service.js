const Role = require("./role.model");
const defs = [
  [
    "SUPER_ADMIN",
    "Super Admin",
    "SYSTEM",
    "GLOBAL",
    1000,
    "SUPER_ADMIN_DASHBOARD",
    { isSystemRole: true, isFacultyStaffRole: true, isAssignable: false },
  ],
  [
    "ADMIN",
    "DoSA Admin",
    "SYSTEM",
    "GLOBAL",
    900,
    "ADMIN_DASHBOARD",
    { isSystemRole: true, isFacultyStaffRole: true },
  ],
  [
    "DOSA",
    "DOSA",
    "FACULTY_STAFF",
    "GLOBAL",
    850,
    "ADMIN_DASHBOARD",
    { isSystemRole: true, isFacultyStaffRole: true },
  ],
  [
    "ADoSA",
    "ADOSA",
    "FACULTY_STAFF",
    "GLOBAL",
    800,
    "ADMIN_DASHBOARD",
    { isSystemRole: true, isFacultyStaffRole: true },
  ],
  [
    "DOSA_STAFF",
    "DOSA Staff",
    "FACULTY_STAFF",
    "GLOBAL",
    750,
    "ADMIN_DASHBOARD",
    { isSystemRole: true, isFacultyStaffRole: true },
  ],
  [
    "ASSISTANT",
    "Assistant",
    "FACULTY_STAFF",
    "GLOBAL",
    700,
    "ADMIN_DASHBOARD",
    { isSystemRole: true, isFacultyStaffRole: true },
  ],
  [
    "SECURITY",
    "Security",
    "SECURITY",
    "GLOBAL",
    600,
    "SECURITY_DASHBOARD",
    { isSystemRole: true },
  ],
  [
    "PRESIDENT",
    "President",
    "FACULTY_STAFF",
    "SOCIETY",
    500,
    "PRESIDENT_DASHBOARD",
    { isFacultyStaffRole: true, isLeadershipRole: true },
  ],
  [
    "VICE_PRESIDENT",
    "Vice President",
    "FACULTY_STAFF",
    "SOCIETY",
    490,
    "PRESIDENT_DASHBOARD",
    { isFacultyStaffRole: true, isLeadershipRole: true },
  ],
  [
    "GENERAL_SECRETARY",
    "General Secretary",
    "STUDENT",
    "SOCIETY",
    400,
    "GENERAL_SECRETARY_DASHBOARD",
    { isStudentRole: true, isLeadershipRole: true, maxConcurrentSocieties: 1 },
  ],
  [
    "VICE_GENERAL_SECRETARY",
    "Vice General Secretary",
    "STUDENT",
    "SOCIETY",
    380,
    "STUDENT_DASHBOARD",
    { isStudentRole: true, isLeadershipRole: true },
  ],
  [
    "SECRETARY",
    "Secretary",
    "STUDENT",
    "SOCIETY",
    360,
    "STUDENT_DASHBOARD",
    { isStudentRole: true, isLeadershipRole: true },
  ],
  [
    "TREASURER",
    "Treasurer",
    "STUDENT",
    "SOCIETY",
    340,
    "STUDENT_DASHBOARD",
    { isStudentRole: true, isLeadershipRole: true },
  ],
  [
    "LEAD",
    "Lead",
    "STUDENT",
    "SOCIETY",
    300,
    "STUDENT_DASHBOARD",
    { isStudentRole: true, isLeadershipRole: true },
  ],
  [
    "CORE_TEAM",
    "Core Team",
    "STUDENT",
    "SOCIETY",
    260,
    "STUDENT_DASHBOARD",
    { isStudentRole: true },
  ],
  [
    "CORE_MEMBER",
    "Core Member",
    "STUDENT",
    "SOCIETY",
    240,
    "STUDENT_DASHBOARD",
    { isStudentRole: true },
  ],
  [
    "MEMBER",
    "Member",
    "STUDENT",
    "SOCIETY",
    200,
    "MEMBER_DASHBOARD",
    { isStudentRole: true },
  ],
  [
    "VOLUNTEER",
    "Volunteer",
    "STUDENT",
    "SOCIETY",
    100,
    "MEMBER_DASHBOARD",
    { isStudentRole: true },
  ],
];
const roles = defs.map(
  ([code, name, category, scopeType, rank, dashboardKey, flags]) => ({
    code,
    name,
    category,
    scopeType,
    rank,
    dashboardKey,
    isSystemRole: false,
    isAssignable: true,
    isLeadershipRole: false,
    isStudentRole: false,
    isFacultyStaffRole: false,
    allowsMultipleSocieties: true,
    status: "ACTIVE",
    ...flags,
  })
);
const reviewTiers = {
  PRESIDENT: "HIGHER", VICE_PRESIDENT: "HIGHER", GENERAL_SECRETARY: "HIGHER", VICE_GENERAL_SECRETARY: "HIGHER", SECRETARY: "HIGHER",
  TREASURER: "LOWER", LEAD: "LOWER", CORE_TEAM: "LOWER", CORE_MEMBER: "LOWER", MEMBER: "LOWER", VOLUNTEER: "LOWER",
};
const seedRoles = async () => {
  let created = 0;
  for (const role of roles) {
    const { name, ...insertDefaults } = role;
    const operation = ["ADMIN", "ADOSA"].includes(role.code)
      ? { $set: { name }, $setOnInsert: insertDefaults }
      : role.code === "SUPER_ADMIN"
      ? { $set: role }
      : { $setOnInsert: role };
    const r = await Role.updateOne(
      { code: role.code },
      operation,
      { upsert: true }
    );
    if (r.upsertedCount) created++;
    if (reviewTiers[role.code]) await Role.updateOne(
      { code: role.code, "metadata.reviewTier": { $exists: false } },
      { $set: { "metadata.reviewTier": reviewTiers[role.code] } }
    );
  }
  return { total: roles.length, created, existing: roles.length - created };
};
module.exports = { seedRoles, defaultRoles: roles };
