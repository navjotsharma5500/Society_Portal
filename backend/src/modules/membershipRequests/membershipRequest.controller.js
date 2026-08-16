const s = require("./membershipRequest.service"),
  ok = (res, data, status = 200) =>
    res.status(status).json({ success: true, data });
module.exports = {
  create: async (req, res) =>
    ok(
      res,
      await s.submit({
        user: req.auth.user,
        student: req.auth.student,
        ...req.body,
      }),
      201
    ),
  me: async (req, res) =>
    ok(
      res,
      await s.my(req.auth.userId, req.pagination.page, req.pagination.limit)
    ),
  get: async (req, res) =>
    ok(res, { request: await s.get(req.auth.userId, req.params.requestId) }),
  assigned: async (req, res) =>
    ok(
      res,
      await s.assigned(
        req.auth.userId,
        req.pagination.page,
        req.pagination.limit,
        req.query
      )
    ),
  counts:async(req,res)=>ok(res,{counts:await s.assignedCounts(req.auth.userId,req.query)}),
  cancel: async (req, res) =>
    ok(res, { request: await s.cancel(req.auth.userId, req.params.requestId) }),
  approve: async (req, res) =>
    ok(res, {
      request: await s.approve({
        actorUserId: req.auth.userId,
        requestId: req.params.requestId,
        ...req.body,
      }),
    }),
  reject: async (req, res) =>
    ok(res, {
      request: await s.reject({
        actorUserId: req.auth.userId,
        requestId: req.params.requestId,
        ...req.body,
      }),
    }),
  clarify:async(req,res)=>ok(res,{request:await s.requestClarification({actorUserId:req.auth.userId,requestId:req.params.requestId,...req.body})}),
  resubmit:async(req,res)=>ok(res,{request:await s.resubmit(req.auth.userId,req.params.requestId,req.body)}),
};
