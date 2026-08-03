const societyService = require("./society.service");

const createSociety = async (req, res) => {
  const society = await societyService.createSociety(req.body);
  res.status(201).json({
    success: true,
    message: "Society created successfully",
    data: { society },
  });
};

const listSocieties = async (req, res) => {
  const data = await societyService.listSocieties(req.societyFilters);
  res.status(200).json({ success: true, data });
};

const getSociety = async (req, res) => {
  const society = await societyService.getSociety(req.params.id);
  res.status(200).json({ success: true, data: { society } });
};

const updateSociety = async (req, res) => {
  const society = await societyService.updateSociety(req.params.id, req.body);
  res.status(200).json({ success: true, data: { society } });
};

const updateSocietyStatus = async (req, res) => {
  const society = await societyService.updateSocietyStatus(
    req.params.id,
    req.body.status
  );
  res.status(200).json({ success: true, data: { society } });
};

module.exports = {
  createSociety,
  listSocieties,
  getSociety,
  updateSociety,
  updateSocietyStatus,
};
