const service = require("./societyClaim.service");
const create = async (req, res) =>
  res
    .status(201)
    .json({
      success: true,
      data: { claim: await service.addClaim(req.auth.userId, req.body) },
    });
const get = async (req,res)=>res.json({success:true,data:{claim:await service.getOwnedClaim(req.auth.userId,req.params.claimId)}});
const update = async (req, res) =>
  res.json({
    success: true,
    data: {
      claim: await service.editClaim(
        req.auth.userId,
        req.params.claimId,
        req.body
      ),
    },
  });
const remove = async (req, res) =>
  res.json({
    success: true,
    data: await service.deleteDraft(req.auth.userId, req.params.claimId),
  });
const resubmit = async (req, res) =>
  res.json({
    success: true,
    data: {
      claim: await service.resubmit(req.auth.userId, req.params.claimId),
    },
  });
module.exports = { create, get, update, remove, resubmit };
