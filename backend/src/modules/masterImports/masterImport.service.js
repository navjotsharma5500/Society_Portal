const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const Department = require("../departments/department.model");
const Building = require("../infrastructure/building.model");
const Venue = require("../infrastructure/venue.model");
const {
  VENUE_TYPES,
  BOOKING_STATUSES,
  RECORD_STATUSES,
  friendlyLabel,
  normalizeEnum,
} = require("../infrastructure/venue.constants");
const Session = require("./masterImportSession.model");

const definitions = {
  DEPARTMENT: { model: Department, columns: ["Department Code", "Department Name", "Department Type", "Campus", "Sort Order", "Status"] },
  BUILDING: { model: Building, columns: ["Building Code", "Building Name", "Campus", "Description", "Sort Order", "Status"] },
  VENUE: { model: Venue, columns: ["Venue Code", "Venue Name", "Building Code", "Venue Type", "Capacity", "Booking Status", "Record Status", "Description"] },
};
const styleHeader = (row) => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF86172C" } };
};
const addListValidation = (sheet, column, formula, errorTitle, error) => {
  for (let row = 2; row <= 1000; row += 1) {
    sheet.getCell(`${column}${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle,
      error,
    };
  }
};
const addAllowedValuesSheet = (workbook) => {
  const sheet = workbook.addWorksheet("Allowed Values");
  const instructions = [
    "Use Building Code from Building Reference.",
    "Use only the listed Venue Type values.",
    "Use only the listed Booking Status values.",
    "Use only the listed Record Status values.",
    "Capacity must be a non-negative whole number.",
    "Do not modify generated IDs.",
  ];
  sheet.mergeCells("A1:C1");
  sheet.getCell("A1").value = "Venue Import Instructions";
  styleHeader(sheet.getRow(1));
  instructions.forEach((instruction) => sheet.addRow([`• ${instruction}`]));
  sheet.addRow([]);
  const headerRow = sheet.addRow(["Field", "Allowed Value", "User Friendly Meaning"]);
  styleHeader(headerRow);
  const ranges = {};
  for (const [field, values] of [
    ["Venue Type", VENUE_TYPES],
    ["Booking Status", BOOKING_STATUSES],
    ["Record Status", RECORD_STATUSES],
  ]) {
    const start = sheet.rowCount + 1;
    values.forEach((value) => sheet.addRow([field, value, friendlyLabel(value)]));
    ranges[field] = { start, end: sheet.rowCount };
  }
  sheet.columns = [{ width: 22 }, { width: 24 }, { width: 34 }];
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  sheet.autoFilter = `A${headerRow.number}:C${headerRow.number}`;
  return ranges;
};
const makeTemplate = async (type) => {
  const def = definitions[type];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${type} Import`);
  sheet.columns = def.columns.map((header) => ({ header, width: Math.max(18, header.length + 4) }));
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = `A1:${String.fromCharCode(64 + def.columns.length)}1`;
  if (type === "VENUE") {
    const buildings = await Building.find({ status: "ACTIVE" }).select("code name publicId campus status sortOrder").sort({ sortOrder: 1, name: 1 }).lean();
    const reference = workbook.addWorksheet("Building Reference");
    reference.mergeCells("A1:E1");
    reference.getCell("A1").value = "Use the Building Code from this sheet in the VENUE Import sheet.";
    reference.getCell("A1").font = { italic: true, color: { argb: "FF86172C" } };
    reference.addRow([]);
    reference.addRow(["Building Code", "Building Name", "Building Public ID", "Campus", "Status"]);
    styleHeader(reference.getRow(3));
    buildings.forEach((building) => reference.addRow([building.code, building.name, building.publicId || "", building.campus || "", building.status]));
    reference.columns = [{ width: 20 }, { width: 36 }, { width: 24 }, { width: 22 }, { width: 16 }];
    reference.views = [{ state: "frozen", ySplit: 3 }];
    reference.autoFilter = "A3:E3";
    const ranges = addAllowedValuesSheet(workbook);
    if (buildings.length) addListValidation(sheet, "C", `INDIRECT("'Building Reference'!$A$4:$A$${buildings.length + 3}")`, "Invalid Building Code", "Choose an active Building Code from Building Reference.");
    addListValidation(sheet, "D", `INDIRECT("'Allowed Values'!$B$${ranges["Venue Type"].start}:$B$${ranges["Venue Type"].end}")`, "Invalid Venue Type", "Choose a Venue Type from Allowed Values.");
    addListValidation(sheet, "F", `INDIRECT("'Allowed Values'!$B$${ranges["Booking Status"].start}:$B$${ranges["Booking Status"].end}")`, "Invalid Booking Status", "Choose a Booking Status from Allowed Values.");
    addListValidation(sheet, "G", `INDIRECT("'Allowed Values'!$B$${ranges["Record Status"].start}:$B$${ranges["Record Status"].end}")`, "Invalid Record Status", "Choose a Record Status from Allowed Values.");
  }
  return workbook.xlsx.writeBuffer();
};

const text = (row, index) => String(row.getCell(index).value?.text ?? row.getCell(index).value?.result ?? row.getCell(index).value ?? "").trim();
const status = (value) => value ? value.toUpperCase() : "ACTIVE";
const allowedMessage = (field, value, allowed) => `Invalid ${field} "${value}". Allowed values: ${allowed.join(", ")}.`;
const preview = async (type, file, actorId) => {
  const def = definitions[type];
  if (!def) throw new AppError("Invalid import type", 400, "INVALID_IMPORT_TYPE");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(file.buffer); } catch (_) { throw new AppError("Unable to read XLSX file", 400, "INVALID_EXCEL_FILE"); }
  const sheet = workbook.worksheets[0], raw = [];
  sheet?.eachRow((row, rowNumber) => { if (rowNumber > 1 && row.values.some(Boolean)) raw.push({ row, rowNumber }); });
  const codes = raw.map(({ row }) => text(row, 1).toUpperCase()).filter(Boolean);
  const existing = await def.model.find({ code: { $in: codes } }).select("code").lean();
  const existingCodes = new Set(existing.map((item) => item.code)), seen = new Set();
  const buildings = type === "VENUE" ? await Building.find({ status: "ACTIVE", code: { $in: raw.map(({ row }) => text(row, 3).toUpperCase()) } }).lean() : [];
  const buildingMap = new Map(buildings.map((item) => [item.code, item]));
  const rows = raw.map(({ row, rowNumber }) => {
    const code = text(row, 1).toUpperCase(), name = text(row, 2), errors = [];
    if (!code) errors.push("CODE_REQUIRED");
    if (!name) errors.push("NAME_REQUIRED");
    if (seen.has(code)) errors.push("DUPLICATE_IN_FILE");
    if (existingCodes.has(code)) errors.push("EXISTING_IN_DATABASE");
    seen.add(code);
    let normalized;
    if (type === "DEPARTMENT") {
      const sortOrder = text(row, 5);
      normalized = { code, name, type: text(row, 3) || undefined, campus: text(row, 4) || undefined, sortOrder: sortOrder === "" ? 0 : Number(sortOrder), status: status(text(row, 6)) };
      if (!Number.isInteger(normalized.sortOrder)) errors.push("INVALID_SORT_ORDER");
    } else if (type === "BUILDING") {
      const sortOrder = text(row, 5);
      normalized = { code, name, campus: text(row, 3) || undefined, description: text(row, 4) || undefined, sortOrder: sortOrder === "" ? 0 : Number(sortOrder), status: status(text(row, 6)) };
      if (!Number.isInteger(normalized.sortOrder)) errors.push("INVALID_SORT_ORDER");
    } else {
      const buildingCode = text(row, 3).toUpperCase(), building = buildingMap.get(buildingCode), capacityText = text(row, 5), rawVenueType = text(row, 4), rawBookingStatus = text(row, 6), rawRecordStatus = text(row, 7), venueType = normalizeEnum(rawVenueType, VENUE_TYPES), bookingStatus = normalizeEnum(rawBookingStatus, BOOKING_STATUSES), recordStatus = normalizeEnum(rawRecordStatus, RECORD_STATUSES);
      normalized = { code, name, buildingCode, buildingId: building?._id, venueType: venueType || rawVenueType.toUpperCase(), capacity: capacityText === "" ? undefined : Number(capacityText), bookingEnabled: bookingStatus === "ENABLED", status: recordStatus || rawRecordStatus.toUpperCase(), description: text(row, 8) || undefined };
      if (!building) errors.push("UNKNOWN_BUILDING_CODE");
      if (!venueType) errors.push(allowedMessage("Venue Type", rawVenueType, VENUE_TYPES));
      if (!bookingStatus) errors.push(allowedMessage("Booking Status", rawBookingStatus, BOOKING_STATUSES));
      if (!recordStatus) errors.push(allowedMessage("Record Status", rawRecordStatus, RECORD_STATUSES));
      if (normalized.capacity !== undefined && (!Number.isInteger(normalized.capacity) || normalized.capacity < 0)) errors.push("INVALID_CAPACITY");
    }
    if (type !== "VENUE" && !RECORD_STATUSES.includes(normalized.status)) errors.push("INVALID_STATUS");
    return { rowNumber, ...normalized, errors, importable: errors.length === 0 };
  });
  const summary = { total: rows.length, valid: rows.filter((item) => item.importable).length, invalid: rows.filter((item) => !item.importable).length };
  const session = await Session.create({ importType: type, sourceFileName: file.originalname, rows, summary, createdBy: actorId, expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
  return { importSessionId: session.id, rows, summary };
};
const confirm = async (id, actorId) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Import session not found", 404, "IMPORT_SESSION_NOT_FOUND");
  const session = await Session.findOne({ _id: id, status: "PREVIEWED", expiresAt: { $gt: new Date() } });
  if (!session) throw new AppError("Import session not found or already used", 409, "IMPORT_SESSION_NOT_AVAILABLE");
  const def = definitions[session.importType], accepted = session.rows.filter((item) => item.importable), results = [];
  for (const row of accepted) {
    try {
      const data = row.toObject ? row.toObject() : row;
      delete data._id; delete data.rowNumber; delete data.errors; delete data.importable; delete data.buildingCode;
      await def.model.create({ ...data, createdBy: actorId, updatedBy: actorId });
      results.push({ rowNumber: row.rowNumber, status: "INSERTED" });
    } catch (error) {
      results.push({ rowNumber: row.rowNumber, status: "SKIPPED", errors: [error.code === 11000 ? "EXISTING_IN_DATABASE" : error.code || "IMPORT_FAILED"] });
    }
  }
  session.status = "IMPORTED"; session.importedAt = new Date(); await session.save();
  return { inserted: results.filter((item) => item.status === "INSERTED").length, updated: 0, skipped: session.rows.length - results.filter((item) => item.status === "INSERTED").length, errors: [...session.rows.filter((item) => !item.importable).map((item) => ({ rowNumber: item.rowNumber, errors: item.errors })), ...results.filter((item) => item.status !== "INSERTED")] };
};
module.exports = { makeTemplate, preview, confirm };
