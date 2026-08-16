const service = require("./event.service"),
  workflow = require("./eventWorkflow.service"),
  ok = (res, data, status = 200) =>
    res.status(status).json({ success: true, data });
module.exports = {
  liveRequestUsage: async (req, res) => ok(res, await service.liveRequestUsage(req.auth.userId, req.query.excludeEventId)),
  create: async (req, res) =>
    ok(
      res,
      {
        event: await service.create({
          user: req.auth.user,
          student: req.auth.student,
          data: req.body,
        }),
      },
      201
    ),
  get: async (req, res) =>
    ok(res, { event: await service.get(req.auth.userId, req.params.eventId) }),
  update: async (req, res) =>
    ok(res, {
      event: await service.update(
        req.auth.userId,
        req.params.eventId,
        req.body
      ),
    }),
  submit: async (req, res) =>
    ok(res, {
      event: await service.submit(req.auth.userId, req.params.eventId),
    }),
  society: async (req, res) =>
    ok(
      res,
      await service.list(req.auth.userId, req.params.societyId, req.query)
    ),
  all: async (req, res) => ok(res, await service.listAll(req.query)),
  reviews: async (req, res) =>
    ok(res, await workflow.queue(req.auth.userId, req.query)),
  reviewDetail: async (req, res) =>
    ok(res, {
      event: await workflow.detail(req.auth.userId, req.params.eventId),
    }),
  reviewCounts: async (req, res) =>
    ok(res, {
      counts: await workflow.counts(req.auth.userId, req.query.societyId),
    }),
  decide: async (req, res) =>
    ok(
      res,
      await workflow.decide({
        userId: req.auth.userId,
        reviewId: req.params.reviewId,
        decision: req.body.decision,
        remarks: req.body.remarks,
        amendment: req.body.amendment,
      })
    ),
  amend: async (req, res) =>
    ok(
      res,
      await workflow.amend({
        userId: req.auth.userId,
        reviewId: req.params.reviewId,
        reason: req.body.reason,
        proposal: req.body.proposal,
      })
    ),
  saveBudgetReview: async (req, res) =>
    ok(res, await workflow.saveBudgetReview({
      userId: req.auth.userId,
      reviewId: req.params.reviewId,
      items: req.body.items,
    })),
};
