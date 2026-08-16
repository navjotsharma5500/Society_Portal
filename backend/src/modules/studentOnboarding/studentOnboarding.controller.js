const service = require("./studentOnboarding.service");
const get = async (req, res) =>
  res.json({ success: true, data: await service.getMe(req.auth.userId) });
const start = async (req, res) =>
  res.status(201).json({
    success: true,
    data: {
      onboarding: await service.start({
        user: req.auth.user,
        student: req.auth.student,
      }),
    },
  });
const update = async (req, res) =>
  res.json({
    success: true,
    data: { onboarding: await service.updateDraft(req.auth.userId, req.body) },
  });
const submit = async (req, res) =>
  res.json({ success: true, data: await service.submit(req.auth.userId,req.body?.mode) });
const progress = async (req, res) =>
  res.json({ success: true, data: await service.progress(req.auth.userId) });
const references = async (req, res) =>
  res.json({ success: true, data: await service.getReferences() });
const accept = async (req, res) =>
  res.json({
    success: true,
    data: {
      onboarding: await service.acceptCurrentResult(req.auth.userId),
      eligibility: await service.resolveOnboardingDashboardEligibility(
        req.auth.userId
      ),
    },
  });
module.exports = { get, start, update, submit, progress, references, accept };
