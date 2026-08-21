const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const service = fs.readFileSync(
  path.join(__dirname, "../src/modules/events/event.service.js"),
  "utf8"
);
const listStart = service.indexOf("const list = async");
const listEnd = service.indexOf("const listAll = async", listStart);
assert(listStart >= 0 && listEnd > listStart, "Society Event list implementation not found");
const societyList = service.slice(listStart, listEnd);

assert(
  societyList.includes(".sort({ createdAt: -1, _id: -1 })"),
  "Society Event list must sort by createdAt DESC and _id DESC"
);
assert(
  !societyList.includes(".sort({ startDate:"),
  "Society Event list must not use scheduled startDate as latest ordering"
);
assert(
  societyList.includes('query.status = { $ne: "DRAFT" }'),
  "President excludeDrafts behavior must remain in the canonical list"
);

console.log(
  JSON.stringify(
    {
      passed: true,
      societyEventListCreatedAtDesc: true,
      deterministicIdTieBreakerDesc: true,
      scheduledDateExcludedFromOrdering: true,
      excludeDraftsPreserved: true,
    },
    null,
    2
  )
);
