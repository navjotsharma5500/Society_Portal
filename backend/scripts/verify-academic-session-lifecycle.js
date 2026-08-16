const mongoose = require("mongoose");
const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const AcademicSession = require("../src/modules/academicSessions/academicSession.model");
const Budget = require("../src/modules/societyBudgets/societyBudget.model");
const Event = require("../src/modules/events/event.model");
const routes = require("../src/modules/academicSessions/academicSession.routes");
const sessions = require("../src/modules/academicSessions/academicSession.service");

const assert = (condition, message) => { if (!condition) throw new Error(message); };

(async () => {
  const tag = Date.now().toString().slice(-8);
  const created = { sessions: [], budgets: [], events: [] };
  let originalCurrent;
  try {
    await connectDatabase();
    originalCurrent = await AcademicSession.findOne({ isCurrent: true }).select("_id").lean();
    const past = await sessions.create({ name: `199${tag.slice(-1)}-${tag.slice(-2)}`, startDate: "1990-07-01", endDate: "1991-06-30" });
    const next = await sessions.create({ name: `219${tag.slice(-1)}-${tag.slice(-2)}`, startDate: "2190-07-01", endDate: "2191-06-30" });
    created.sessions.push(past._id, next._id);
    await sessions.setCurrent(past._id);

    const budgetId = new mongoose.Types.ObjectId(), eventId = new mongoose.Types.ObjectId();
    await Budget.collection.insertOne({ _id: budgetId, academicSessionId: past._id, academicSession: past.name, societyId: new mongoose.Types.ObjectId(), allocatedAmount: 0, createdAt: new Date(), updatedAt: new Date() });
    await Event.collection.insertOne({ _id: eventId, academicSessionId: past._id, academicSession: past.name, eventCode: `VERIFY-${tag}`, eventNumber: Number(tag), societyId: new mongoose.Types.ObjectId(), createdByUserId: new mongoose.Types.ObjectId(), createdByMembershipId: new mongoose.Types.ObjectId(), createdFromRoleAssignmentId: new mongoose.Types.ObjectId(), createdAt: new Date(), updatedAt: new Date() });
    created.budgets.push(budgetId); created.events.push(eventId);

    await sessions.setCurrent(next._id);
    assert(await AcademicSession.countDocuments({ isCurrent: true }) === 1, "only one session may be current");
    assert(await AcademicSession.exists({ _id: past._id, isCurrent: false }), "previous session must remain stored");
    assert(await Budget.exists({ _id: budgetId, academicSessionId: past._id }), "budget reference changed");
    assert(await Event.exists({ _id: eventId, academicSessionId: past._id }), "event reference changed");

    await sessions.update(next._id, { name: next.name, startDate: "2190-07-01", endDate: "2191-06-29", description: "current edited", semesters: [] });
    await sessions.update(past._id, { name: past.name, startDate: "1990-07-01", endDate: "1991-06-29", description: "past edited", semesters: [] });
    await AcademicSession.updateOne({ _id: past._id }, { $set: { status: "CLOSED" } });
    const legacy = await sessions.update(past._id, { name: past.name, startDate: "1990-07-01", endDate: "1991-06-28", description: "legacy edited", semesters: [] });
    assert(legacy.description === "legacy edited", "legacy CLOSED session must remain editable");
    assert((await sessions.listSessions()).some((item) => String(item._id) === String(past._id)), "legacy CLOSED session must remain readable");

    const exposed = routes.stack.map((layer) => ({ path: layer.route?.path, methods: layer.route?.methods || {} }));
    assert(!exposed.some((route) => route.path === "/:id/close"), "manual close route must not be exposed");
    assert(!exposed.some((route) => route.methods.delete), "delete route must not be exposed");
    assert(typeof sessions.close === "undefined", "manual close service must not be exposed");
    console.log(JSON.stringify({ passed: 11, oneCurrent: true, previousStored: true, currentEditable: true, pastEditable: true, legacyClosedReadableEditable: true, noCloseAction: true, noDeleteAction: true, referencesIntact: true }, null, 2));
  } finally {
    await Event.deleteMany({ _id: { $in: created.events } }).catch(() => {});
    await Budget.deleteMany({ _id: { $in: created.budgets } }).catch(() => {});
    await AcademicSession.updateMany({ _id: { $in: created.sessions } }, { $set: { isCurrent: false } }).catch(() => {});
    if (originalCurrent) await AcademicSession.updateOne({ _id: originalCurrent._id }, { $set: { isCurrent: true, status: "ACTIVE" } }).catch(() => {});
    await AcademicSession.deleteMany({ _id: { $in: created.sessions } }).catch(() => {});
    await disconnectDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
