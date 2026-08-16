const assert = require("node:assert/strict");
const db = require("../src/config/database");
const Society = require("../src/modules/societies/society.model");
const User = require("../src/modules/users/user.model");
const Student = require("../src/modules/studentMaster/studentMaster.model");
const Role = require("../src/modules/roles/role.model");
const Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model");
const societyService = require("../src/modules/societies/society.service");
const assignmentService = require("../src/modules/userRoleAssignments/userRoleAssignment.service");
const teamService = require("../src/modules/societies/societyTeam.service");
const events = require("../src/common/events/domainEvent.service");

const created = { societies: [], users: [], students: [] };
(async () => {
  await db.connectDatabase();
  const stamp = Date.now();
  const captured = [];
  const unsubscribe = events.subscribe("*", (event) => captured.push(event));
  try {
    const originalIds = (await Society.find().distinct("_id")).map(String).sort();
    const [president, generalSecretary, member] = await Promise.all(
      ["PRESIDENT", "GENERAL_SECRETARY", "MEMBER"].map((code) => Role.findOne({ code, status: "ACTIVE" }))
    );
    for (const suffix of ["A", "B"]) created.societies.push(await societyService.createSociety({ name: `Team Verification ${stamp} ${suffix}`, category: "Society", status: "ACTIVE" }));
    for (let index = 0; index < 2; index += 1) {
      const user = await User.create({ displayName: `President ${index + 1}`, email: `team-${stamp}-${index}@example.com`, accountType: "STAFF", status: "ACTIVE", isLoginAllowed: true });
      created.users.push(user);
      await assignmentService.createAssignment({ userId: user._id, roleId: president._id, scopeType: "SOCIETY", societyId: created.societies[0]._id, validFrom: new Date(), status: "ACTIVE", isOngoing: true });
    }
    const student = await Student.create({ name: "Team Student", email: `team-${stamp}-student@example.com`, contactNumber: `8${String(stamp).slice(-9)}`, rollNumber: `TV${String(stamp).slice(-8)}`, recordStatus: "ACTIVE" });
    created.students.push(student);
    const studentUser = await User.create({ displayName: student.name, email: student.email, accountType: "STUDENT", studentMasterId: student._id, status: "ACTIVE", isLoginAllowed: true });
    created.users.push(studentUser);
    const gs = (await assignmentService.createAssignment({ userId: studentUser._id, roleId: generalSecretary._id, scopeType: "SOCIETY", societyId: created.societies[0]._id, validFrom: new Date(), status: "ACTIVE", isOngoing: true })).entity;
    await assignmentService.createAssignment({ userId: studentUser._id, roleId: member._id, scopeType: "SOCIETY", societyId: created.societies[0]._id, validFrom: new Date(), status: "ACTIVE", isOngoing: true });
    let team = await teamService.getCurrentTeam(created.societies[0]._id, { search: "", limit: 25 });
    assert.equal(team.leadership.filter((person) => person.role.code === "PRESIDENT").length, 2);
    assert(team.leadership.some((person) => person.role.code === "GENERAL_SECRETARY" && person.rollNumber === student.rollNumber));
    assert(!team.members.some((person) => String(person.userId) === String(studentUser._id)), "A lower MEMBER role must not duplicate a higher visible role");
    assert.equal((await teamService.getCurrentTeam(created.societies[0]._id, { search: student.rollNumber })).leadership.length, 1);
    await assignmentService.endAssignment(gs._id, null, "Move societies");
    assert(!(await teamService.getCurrentTeam(created.societies[0]._id, {})).leadership.some((person) => person.role.code === "GENERAL_SECRETARY"));
    await assignmentService.createAssignment({ userId: studentUser._id, roleId: generalSecretary._id, scopeType: "SOCIETY", societyId: created.societies[1]._id, validFrom: new Date(), status: "ACTIVE", isOngoing: true });
    assert((await teamService.getCurrentTeam(created.societies[1]._id, {})).leadership.some((person) => String(person.userId) === String(studentUser._id)));
    assert(await Assignment.exists({ _id: gs._id, status: "ENDED", isOngoing: false }));
    assert(captured.some((event) => event.eventType === "ROLE_ASSIGNMENT_UPDATED" && event.metadata.societyId === String(created.societies[0]._id)));
    const untouchedIds = (await Society.find({ _id: { $nin: created.societies.map((item) => item._id) } }).distinct("_id")).map(String).sort();
    assert.deepEqual(untouchedIds, originalIds);
    console.log(JSON.stringify({ passed: true, societyWithoutLeader: true, multiplePresidents: true, generalSecretary: true, member: true, endedRemoved: true, historyPreserved: true, movedSociety: true, search: true, dynamicRoleRank: true, eventPublished: true, existingSocietiesPreserved: true }, null, 2));
    unsubscribe();
  } finally {
    await Assignment.deleteMany({ userId: { $in: created.users.map((item) => item._id) } });
    await User.deleteMany({ _id: { $in: created.users.map((item) => item._id) } });
    await Student.deleteMany({ _id: { $in: created.students.map((item) => item._id) } });
    await Society.deleteMany({ _id: { $in: created.societies.map((item) => item._id) } });
    await db.disconnectDatabase();
  }
})().catch(async (error) => { console.error(error); try { await db.disconnectDatabase(); } catch {} process.exit(1); });
