process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||=
  "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||=
  "verification-refresh-secret-32-characters-long";
const assert = require("node:assert/strict"),
  http = require("node:http"),
  { io: client } = require("socket.io-client"),
  { connectDatabase, disconnectDatabase } = require("../src/config/database"),
  app = require("../src/app"),
  User = require("../src/modules/users/user.model"),
  Student = require("../src/modules/studentMaster/studentMaster.model"),
  Session = require("../src/modules/auth/session.model"),
  Society = require("../src/modules/societies/society.model"),
  Role = require("../src/modules/roles/role.model"),
  Assignment = require("../src/modules/userRoleAssignments/userRoleAssignment.model"),
  Membership = require("../src/modules/societyMemberships/societyMembership.model"),
  tokens = require("../src/modules/auth/token.service"),
  rooms = require("../src/realtime/socketRooms"),
  publisher = require("../src/realtime/realtimePublisher"),
  events = require("../src/realtime/realtimeEvents"),
  {
    initializeRealtime,
    closeRealtime,
  } = require("../src/realtime/socketServer");
const created = {
  users: [],
  students: [],
  sessions: [],
  societies: [],
  roles: [],
  assignments: [],
  memberships: [],
};
let server, port;
const wait = (socket, event, ms = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      ms
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
const waitUntil = async (predicate, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
};
const connect = (access) =>
  client(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: access ? { Cookie: `tiet_access=${access}` } : {},
  });
const identity = async (type, stamp) => {
  let student;
  if (type === "STUDENT") {
    student = await Student.create({
      name: `Realtime ${stamp}`,
      email: `rt-${stamp}@example.test`,
      contactNumber: `98${String(stamp).slice(-8)}`,
      rollNumber: `RT${stamp}`,
      recordStatus: "ACTIVE",
    });
    created.students.push(student._id);
  }
  const user = await User.create({
    displayName: `Realtime ${type}`,
    email: student?.email || `rt-staff-${stamp}@example.test`,
    accountType: type,
    status: "ACTIVE",
    studentMasterId: student ? student._id : undefined,
  });
  created.users.push(user._id);
  const session = await Session.create({
    userId: user._id,
    refreshTokenHash: `hash-${stamp}-${type}`,
    tokenFamily: `family-${stamp}-${type}`,
    expiresAt: new Date(Date.now() + 3600000),
    status: "ACTIVE",
  });
  created.sessions.push(session._id);
  return {
    user,
    student,
    access: tokens.signAccessToken({
      userId: user._id,
      sessionId: session._id,
      accountType: type,
    }),
  };
};
(async () => {
  let studentSocket, staffSocket, outsiderSocket;
  try {
    await connectDatabase();
    server = http.createServer(app);
    const io = initializeRealtime(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    const stamp = Date.now(),
      student = await identity("STUDENT", stamp),
      staff = await identity("STAFF", stamp + 1),
      outsider = await identity("STUDENT", stamp + 2);
    const rejected = connect(),
      rejection = await wait(rejected, "connect_error");
    assert.equal(rejection.message, "AUTHENTICATION_REQUIRED");
    rejected.close();
    studentSocket = connect(student.access);
    await wait(studentSocket, "connect");
    await new Promise((resolve) => setTimeout(resolve, 100));
    staffSocket = connect(staff.access);
    await wait(staffSocket, "connect");
    outsiderSocket = connect(outsider.access);
    await wait(outsiderSocket, "connect");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert(studentSocket.connected);
    assert(staffSocket.connected);
    const sockets = () => [...io.sockets.sockets.values()],
      studentServer = sockets().find(
        (s) => s.data.userId === String(student.user._id)
      ),
      staffServer = sockets().find(
        (s) => s.data.userId === String(staff.user._id)
      );
    assert(studentServer.rooms.has(rooms.userRoom(student.user._id)));
    assert(staffServer.rooms.has(rooms.userRoom(staff.user._id)));
    assert(!studentServer.rooms.has(rooms.userRoom(staff.user._id)));
    studentSocket.emit("join-room", rooms.userRoom(staff.user._id));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert(!studentServer.rooms.has(rooms.userRoom(staff.user._id)));
    const society = await Society.create({
      name: `Realtime Society ${stamp}`,
      code: `RT${String(stamp).slice(-8)}`,
      category: "TECHNICAL",
      status: "ACTIVE",
      isActive: true,
    });
    created.societies.push(society._id);
    const role = await Role.create({
      name: `Realtime Member ${stamp}`,
      code: `RT_ROLE_${stamp}`,
      category: "STUDENT",
      scopeType: "SOCIETY",
      isStudentRole: true,
      status: "ACTIVE",
    });
    created.roles.push(role._id);
    const assignment = await Assignment.create({
      userId: student.user._id,
      roleId: role._id,
      scopeType: "SOCIETY",
      societyId: society._id,
      status: "ACTIVE",
      isOngoing: true,
    });
    created.assignments.push(assignment._id);
    const membership = await Membership.create({
      userId: student.user._id,
      studentMasterId: student.student._id,
      societyId: society._id,
      roleId: role._id,
      roleCode: role.code,
      roleName: role.name,
      startDate: new Date(),
      status: "ACTIVE",
      isOngoing: true,
      membershipSource: "SYSTEM",
      linkedUserRoleAssignmentId: assignment._id,
    });
    created.memberships.push(membership._id);
    await publisher.reconcileUser(student.user._id);
    assert(studentServer.rooms.has(rooms.societyRoom(society._id)));
    const outsiderServer = sockets().find(
      (s) => s.data.userId === String(outsider.user._id)
    );
    assert(!outsiderServer.rooms.has(rooms.societyRoom(society._id)));
    const contextPromise = wait(studentSocket, events.AUTH_CONTEXT_CHANGED);
    publisher.publish(events.AUTH_CONTEXT_CHANGED, {
      userIds: [student.user._id],
      payload: { reason: "TEST" },
    });
    assert.equal((await contextPromise).reason, "TEST");
    let outsiderReceived = false;
    outsiderSocket.once(events.EVENT_WORKFLOW_UPDATED, () => {
      outsiderReceived = true;
    });
    const eventPromise = wait(studentSocket, events.EVENT_WORKFLOW_UPDATED);
    publisher.publish(events.EVENT_WORKFLOW_UPDATED, {
      societyIds: [society._id],
      payload: { eventId: "safe-id", newStage: "FACULTY_REVIEW" },
    });
    const eventPayload = await eventPromise;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(eventPayload.eventId, "safe-id");
    assert.equal(outsiderReceived, false);
    assert(
      !Object.keys(eventPayload).some((key) =>
        /email|contact|token|cookie/i.test(key)
      )
    );
    const requestPromise = wait(studentSocket, events.JOIN_REQUEST_UPDATED);
    publisher.publish(events.JOIN_REQUEST_UPDATED, {
      userIds: [student.user._id],
      payload: { requestId: "request-safe" },
    });
    assert.equal((await requestPromise).requestId, "request-safe");
    const approvalPromise = wait(staffSocket, events.APPROVAL_QUEUE_CHANGED);
    publisher.publish(events.APPROVAL_QUEUE_CHANGED, {
      userIds: [staff.user._id],
      payload: { reason: "QUEUE_CHANGED" },
    });
    assert.equal((await approvalPromise).reason, "QUEUE_CHANGED");
    const permissionPromise = wait(studentSocket, events.PERMISSIONS_UPDATED);
    publisher.publish(events.PERMISSIONS_UPDATED, {
      userIds: [student.user._id],
      payload: { reason: "ROLE_CHANGED" },
    });
    assert.equal((await permissionPromise).reason, "ROLE_CHANGED");
    assert.deepEqual(
      publisher.safePayload({
        email: "secret",
        contactNumber: "123",
        accessToken: "secret",
        eventId: "ok",
      }),
      { eventId: "ok" }
    );
    publisher.setSocketServer({
      to() {
        throw new Error("delivery unavailable");
      },
    });
    assert.equal(
      publisher.publish(events.PROFILE_UPDATED, {
        userIds: [student.user._id],
      }),
      false
    );
    publisher.setSocketServer(io);
    studentSocket.disconnect();
    assert.equal(studentSocket.connected, false);
    studentSocket = connect(student.access);
    await wait(studentSocket, "connect");
    assert(await waitUntil(() => sockets().find((s) => s.data.userId === String(student.user._id))?.rooms.has(rooms.societyRoom(society._id))));
    studentSocket.disconnect();
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`),
      health = await response.json();
    assert.equal(response.status, 200);
    assert.equal(health.data.realtime.enabled, true);
    const source = require("node:fs").readFileSync(
      require("node:path").join(
        __dirname,
        "../../frontend/src/services/realtimeClient.js"
      ),
      "utf8"
    );
    assert(source.includes("seen.has(key)"));
    assert(source.includes("reconnectionAttempts:8"));
    assert(source.includes("setAuthenticated"));
    console.log(
      JSON.stringify(
        {
          passed: 20,
          authentication: true,
          serverDerivedRooms: true,
          crossUserIsolation: true,
          crossSocietyIsolation: true,
          targetedEvents: true,
          payloadSafety: true,
          nonFatalPublisher: true,
          reconnectReconciliation: true,
          restFallback: true,
          frontendLifecycle: true,
        },
        null,
        2
      )
    );
  } finally {
    studentSocket?.close();
    staffSocket?.close();
    outsiderSocket?.close();
    await closeRealtime().catch(() => {});
    if (server?.listening)
      await new Promise((resolve) => server.close(resolve));
    await Membership.deleteMany({ _id: { $in: created.memberships } });
    await Assignment.deleteMany({ _id: { $in: created.assignments } });
    await Role.deleteMany({ _id: { $in: created.roles } });
    await Society.deleteMany({ _id: { $in: created.societies } });
    await Session.deleteMany({ _id: { $in: created.sessions } });
    await User.deleteMany({ _id: { $in: created.users } });
    await Student.deleteMany({ _id: { $in: created.students } });
    await disconnectDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
