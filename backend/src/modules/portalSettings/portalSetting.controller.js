const service = require("./portalSetting.service");
const publicSettings = async (req, res) =>
  res.json({ success: true, data: { settings: await service.getPublic() } });
const all = async (req, res) =>
  res.json({ success: true, data: { settings: await service.getAll() } });
const update = async (req, res) =>
  res.json({
    success: true,
    data: {
      setting: await service.update(
        req.params.key,
        req.body.value,
        req.auth.userId
      ),
    },
  });
module.exports = { publicSettings, all, update };
