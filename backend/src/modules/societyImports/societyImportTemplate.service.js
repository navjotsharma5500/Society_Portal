const ExcelJS = require("exceljs");
const { ENTITY_TYPES, CAMPUSES } = require("./societyImport.constants");

const createTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TIET Society Portal";
  const sheet = workbook.addWorksheet("Societies", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    ["Society Name*", 34], ["Society Code", 20], ["Society Official Email", 30],
    ["Entity Type*", 22], ["Campus*", 18], ["Category", 20],
    ["Academic Session*", 20], ["Active", 12],
  ].map(([header, width]) => ({ header, width }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  sheet.addRow(["Example Technical Society", "", "example.society@example.edu", "SOCIETY", "PATIALA", "Society", "2026-27", "TRUE"]);
  for (let row = 2; row <= 500; row += 1) {
    sheet.getCell(row, 4).dataValidation = { type: "list", allowBlank: false, formulae: [`"${Object.values(ENTITY_TYPES).join(",")}"`] };
    sheet.getCell(row, 5).dataValidation = { type: "list", allowBlank: false, formulae: [`"${Object.values(CAMPUSES).join(",")}"`] };
    sheet.getCell(row, 8).dataValidation = { type: "list", allowBlank: false, formulae: ['"TRUE,FALSE"'] };
  }

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 28 }, { width: 100 }];
  instructions.addRows([
    ["TIET Society Import", "Complete the Societies sheet, preview the upload, then confirm it."],
    ["Mandatory fields", "Society Name, Entity Type, Campus, and Academic Session."],
    ["Entity types", Object.values(ENTITY_TYPES).join(", ")],
    ["Campuses", Object.values(CAMPUSES).join(", ")],
    ["Email formatting", "Use a single valid email address without line breaks."],
    ["Society Code", "May be blank and will be generated during preview."],
    ["Team assignments", "Create the Society first, then assign existing Users through canonical society-scoped roles or memberships."],
    ["Import flow", "Every upload requires preview before confirm."],
  ]);
  instructions.getRow(1).font = { bold: true, size: 14 };
  return workbook.xlsx.writeBuffer();
};

module.exports = { createTemplate };
