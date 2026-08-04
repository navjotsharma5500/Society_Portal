const service = require("./societyImport.service");
const templateService = require("./societyImportTemplate.service");

const downloadTemplate = async (req, res) => {
  const buffer = await templateService.createTemplate();
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="TIET-Society-Import-Template.xlsx"',
  });
  res.send(buffer);
};

const preview = async (req, res) => {
  const data = await service.previewImport(req.file, req.body.academicSession);
  res.status(200).json({ success: true, message: "Society import preview generated successfully", data });
};

const getSession = async (req, res) => {
  const data = await service.getImportSession(req.params.importSessionId);
  res.status(200).json({ success: true, data });
};

const confirm = async (req, res) => {
  const data = await service.confirmImport(req.params.importSessionId);
  res.status(200).json({ success: true, message: "Society import completed", data });
};

module.exports = { downloadTemplate, preview, getSession, confirm };
