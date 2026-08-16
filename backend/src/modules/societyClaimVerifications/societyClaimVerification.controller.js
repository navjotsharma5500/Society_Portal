const service = require("./societyClaimVerification.service");
const queue = async (req, res) =>
  res.json({
    success: true,
    data: await service.assignedToMe(req.auth.userId, req.pagination),
  });
const counts=async(req,res)=>res.json({success:true,data:{counts:await service.assignedCounts(req.auth.userId,req.query)}});
const get = async (req, res) =>
  res.json({
    success: true,
    data: await service.getClaim(req.auth.userId, req.params.claimId),
  });
const call = (method) => async (req, res) =>
  res.json({
    success: true,
    data: {
      claim: await service[method]({
        userId: req.auth.userId,
        claimId: req.params.claimId,
        ...req.body,
      }),
    },
  });
module.exports = {
  queue,
  counts,
  get,
  approve: call("approve"),
  reject: call("reject"),
  requestChanges: call("requestChanges"),
};
