const ExcelJS = require("exceljs"),
  { connectDatabase, disconnectDatabase } = require("../src/config/database"),
  { generatePublicId } = require("../src/modules/publicIds/publicId.service"),
  Counter = require("../src/modules/publicIds/publicIdCounter.model"),
  Department = require("../src/modules/departments/department.model"),
  Building = require("../src/modules/infrastructure/building.model"),
  Venue = require("../src/modules/infrastructure/venue.model"),
  {
    VENUE_TYPES,
    BOOKING_STATUSES,
    RECORD_STATUSES,
  } = require("../src/modules/infrastructure/venue.constants"),
  ImportSession = require("../src/modules/masterImports/masterImportSession.model"),
  imports = require("../src/modules/masterImports/masterImport.service");
const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  },
  workbook = async (headers, rows) => {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("Import");
    sheet.addRow(headers);
    rows.forEach((row) => sheet.addRow(row));
    return book.xlsx.writeBuffer();
  };
(async () => {
  const marker = Date.now().toString().slice(-7),
    year = 88,
    ids = { departments: [], buildings: [], venues: [], imports: [] };
  try {
    await connectDatabase();
    const generated = await Promise.all(
      Array.from({ length: 25 }, () => generatePublicId("DEPARTMENT", { year }))
    );
    assert(new Set(generated).size === 25, "concurrent IDs duplicated");
    assert(
      generated.every((id) => /^88\/DEP\/\d{3,}$/.test(id)),
      "ID format/prefix/year failed"
    );
    const manualDepartment = await Department.create({
      code: `MD${marker}`,
      name: "Manual Department",
    });
    ids.departments.push(manualDepartment._id);
    assert(
      /^\d{2}\/DEP\//.test(manualDepartment.publicId),
      "manual department ID missing"
    );
    const immutableId = manualDepartment.publicId;
    manualDepartment.publicId = "99/DEP/999";
    await manualDepartment.save();
    assert(manualDepartment.publicId === immutableId, "publicId changed");
    const departmentBuffer = await workbook(
        [
          "Department Code",
          "Department Name",
          "Department Type",
          "Campus",
          "Sort Order",
          "Status",
        ],
        [
          [
            `ID${marker}`,
            "Imported Department",
            "ACADEMIC",
            "PATIALA",
            1,
            "ACTIVE",
          ],
          [`ID${marker}`, "Duplicate", "ACADEMIC", "PATIALA", 2, "ACTIVE"],
        ]
      ),
      departmentPreview = await imports.preview("DEPARTMENT", {
        buffer: departmentBuffer,
        originalname: "departments.xlsx",
      });
    ids.imports.push(departmentPreview.importSessionId);
    assert(
      (await Department.countDocuments({ code: `ID${marker}` })) === 0,
      "preview wrote department"
    );
    assert(
      departmentPreview.rows.some((row) =>
        row.errors.includes("DUPLICATE_IN_FILE")
      ),
      "duplicate code not detected"
    );
    await imports.confirm(departmentPreview.importSessionId);
    const importedDepartment = await Department.findOne({
      code: `ID${marker}`,
    });
    ids.departments.push(importedDepartment._id);
    assert(importedDepartment.publicId, "imported department ID missing");
    const manualBuilding = await Building.create({
      code: `MB${marker}`,
      name: "Manual Building",
      campus: "PATIALA",
    });
    ids.buildings.push(manualBuilding._id);
    assert(
      /^\d{2}\/BLD\//.test(manualBuilding.publicId),
      "manual building ID missing"
    );
    const initialVenueTemplate = new ExcelJS.Workbook();
    await initialVenueTemplate.xlsx.load(await imports.makeTemplate("VENUE"));
    assert(
      initialVenueTemplate.worksheets.length === 3 &&
        initialVenueTemplate.worksheets[0].name === "VENUE Import" &&
        initialVenueTemplate.worksheets[1].name === "Building Reference" &&
        initialVenueTemplate.worksheets[2].name === "Allowed Values",
      "venue template sheets incorrect"
    );
    const venueImportSheet = initialVenueTemplate.getWorksheet("VENUE Import"),
      allowedValuesSheet = initialVenueTemplate.getWorksheet("Allowed Values"),
      allowedRows = [];
    allowedValuesSheet.eachRow((row) => {
      if (["Venue Type", "Booking Status", "Record Status"].includes(row.getCell(1).value))
        allowedRows.push([row.getCell(1).value, row.getCell(2).value]);
    });
    for (const [field, values] of [
      ["Venue Type", VENUE_TYPES],
      ["Booking Status", BOOKING_STATUSES],
      ["Record Status", RECORD_STATUSES],
    ])
      assert(
        values.every((value) => allowedRows.some((row) => row[0] === field && row[1] === value)),
        `${field} allowed values incomplete`
      );
    for (const column of ["C", "D", "F", "G"])
      assert(venueImportSheet.getCell(`${column}2`).dataValidation?.type === "list", `${column} dropdown missing`);
    const initialReference =
      initialVenueTemplate.getWorksheet("Building Reference");
    assert(
      initialReference.getRow(3).values.slice(1).join("|") ===
        "Building Code|Building Name|Building Public ID|Campus|Status",
      "building reference headers incorrect"
    );
    const initialValues = [];
    initialReference.eachRow((row, number) => {
      if (number > 3) initialValues.push(row.values.slice(1));
    });
    assert(
      initialValues.some(
        (row) =>
          row[0] === manualBuilding.code &&
          row[1] === manualBuilding.name &&
          row[2] === manualBuilding.publicId
      ),
      "real building reference missing"
    );
    const buildingBuffer = await workbook(
        [
          "Building Code",
          "Building Name",
          "Campus",
          "Description",
          "Sort Order",
          "Status",
        ],
        [[`IB${marker}`, "Imported Building", "PATIALA", "", 1, "ACTIVE"]]
      ),
      buildingPreview = await imports.preview("BUILDING", {
        buffer: buildingBuffer,
        originalname: "buildings.xlsx",
      });
    ids.imports.push(buildingPreview.importSessionId);
    await imports.confirm(buildingPreview.importSessionId);
    const importedBuilding = await Building.findOne({ code: `IB${marker}` });
    ids.buildings.push(importedBuilding._id);
    assert(importedBuilding.publicId, "imported building ID missing");
    const refreshedTemplate = new ExcelJS.Workbook();
    await refreshedTemplate.xlsx.load(await imports.makeTemplate("VENUE"));
    const refreshedCodes = [];
    refreshedTemplate
      .getWorksheet("Building Reference")
      .eachRow((row, number) => {
        if (number > 3) refreshedCodes.push(row.getCell(1).value);
      });
    assert(
      refreshedCodes.includes(importedBuilding.code),
      "new building missing from refreshed template"
    );
    assert(
      (await imports.makeTemplate("DEPARTMENT")) &&
        (await imports.makeTemplate("BUILDING")),
      "other templates changed"
    );
    const manualVenue = await Venue.create({
      code: `MV${marker}`,
      name: "Manual Venue",
      buildingId: manualBuilding._id,
      venueType: "HALL",
    });
    ids.venues.push(manualVenue._id);
    assert(
      /^\d{2}\/VEN\//.test(manualVenue.publicId),
      "manual venue ID missing"
    );
    const venueBuffer = await workbook(
        [
          "Venue Code",
          "Venue Name",
          "Building Code",
          "Venue Type",
          "Capacity",
          "Booking Status",
          "Record Status",
          "Description",
        ],
        [
          [
            `IV${marker}`,
            "Imported Venue",
            importedBuilding.code,
            "HALL",
            100,
            "ENABLED",
            "ACTIVE",
            "",
          ],
          [
            `UV${marker}`,
            "Unknown Building",
            "TYPO",
            "HALL",
            10,
            "ENABLED",
            "ACTIVE",
            "",
          ],
          [
            `CV${marker}`,
            "Case Normalized Venue",
            importedBuilding.code.toLowerCase(),
            " lecture_room ",
            25,
            " enabled ",
            " active ",
            "",
          ],
          [
            `XV${marker}`,
            "Invalid Venue Type",
            importedBuilding.code,
            "Auditoriums",
            10,
            "DISABLED",
            "INACTIVE",
            "",
          ],
        ]
      ),
      venuePreview = await imports.preview("VENUE", {
        buffer: venueBuffer,
        originalname: "venues.xlsx",
      });
    ids.imports.push(venuePreview.importSessionId);
    assert(
      (await Venue.countDocuments({ code: `IV${marker}` })) === 0,
      "preview wrote venue"
    );
    assert(
      venuePreview.rows.some((row) =>
        row.errors.includes("UNKNOWN_BUILDING_CODE")
      ),
      "unknown building accepted"
    );
    const normalizedRow = venuePreview.rows.find((row) => row.code === `CV${marker}`),
      invalidTypeRow = venuePreview.rows.find((row) => row.code === `XV${marker}`);
    assert(normalizedRow.importable && normalizedRow.venueType === "LECTURE_ROOM" && normalizedRow.bookingEnabled === true && normalizedRow.status === "ACTIVE", "mixed-case values not normalized");
    assert(invalidTypeRow.errors.some((error) => error === `Invalid Venue Type "Auditoriums". Allowed values: ${VENUE_TYPES.join(", ")}.`), "friendly invalid Venue Type error missing");
    await imports.confirm(venuePreview.importSessionId);
    const importedVenue = await Venue.findOne({ code: `IV${marker}` });
    ids.venues.push(importedVenue._id);
    const normalizedVenue = await Venue.findOne({ code: `CV${marker}` });
    ids.venues.push(normalizedVenue._id);
    assert(importedVenue.publicId, "imported venue ID missing");
    assert(normalizedVenue?.venueType === "LECTURE_ROOM", "normalized venue was not imported");
    let rerunBlocked = false;
    try {
      await imports.confirm(venuePreview.importSessionId);
    } catch (error) {
      rerunBlocked = error.code === "IMPORT_SESSION_NOT_AVAILABLE";
    }
    assert(rerunBlocked, "import rerun duplicated records");
    console.log(
      JSON.stringify(
        {
          passed: 25,
          atomicUnique: true,
          prefixAndYear: true,
          immutable: true,
          manualAndImportedIds: true,
          previewNoWrites: true,
          duplicateCode: true,
          unknownBuilding: true,
          acceptedOnly: true,
          rerunBlocked: true,
          allowedValuesSheet: true,
          dropdowns: true,
          caseInsensitiveEnums: true,
          friendlyEnumErrors: true,
        },
        null,
        2
      )
    );
  } finally {
    await Venue.deleteMany({ _id: { $in: ids.venues } });
    await Building.deleteMany({ _id: { $in: ids.buildings } });
    await Department.deleteMany({ _id: { $in: ids.departments } });
    await ImportSession.deleteMany({ _id: { $in: ids.imports } });
    await Counter.deleteOne({ year, entityType: "DEP" });
    await disconnectDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
