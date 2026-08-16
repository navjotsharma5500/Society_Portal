const s = require("./societyMembership.service"),
  exp = require("./membershipBulkExport.service"),
  ok = (res, data) => res.json({ success: true, data }),
  live = (res, data) => {res.set("Cache-Control","no-store, no-cache, must-revalidate, private");return ok(res,data)};
module.exports = {
  list: async (req, res) => ok(res, await s.list(req.filters)),
  get: async (req, res) =>
    ok(res, {
      membership: await s.get(req.auth.userId, req.params.membershipId),
    }),
  me: async (req, res) => live(res, await s.my(req.auth.userId, req.filters)),
  history: async (req, res) =>
    live(res, await s.my(req.auth.userId, req.filters, true)),
  societyActive: async (req, res) =>
    ok(
      res,
      await s.societyActive(req.auth.userId, req.params.societyId, req.filters)
    ),
  societyActiveCount: async (req, res) =>
    ok(res, {
      count: await s.societyActiveCount(req.auth.userId, req.params.societyId),
    }),
  societyHistory: async (req, res) =>
    ok(res, await s.list({ ...req.filters, societyId: req.params.societyId })),
  end: async (req, res) =>
    ok(res, {
      membership: await s.end({
        membershipId: req.params.membershipId,
        actorUserId: req.auth.userId,
        ...req.body,
      }),
    }),
  restore: async (req, res) =>
    ok(res, {
      membership: await s.restore({
        membershipId: req.params.membershipId,
        actorUserId: req.auth.userId,
        ...req.body,
      }),
    }),
  export: async (req, res) => {
    const b = await exp.generate(req.filters);
    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        "attachment; filename=TIET-Society-Membership-Export.xlsx",
    });
    res.send(b);
  },
};
