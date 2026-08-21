import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createStudentPortalDataRequestCache,
  EMPTY_STUDENT_PORTAL_DATA,
} from "../src/modules/auth/hooks/studentPortalDataRequest.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const [approvalCenter, router, studentHome, portalHook] = await Promise.all([
  read("src/modules/approvals/pages/ApprovalCenterPage.jsx"),
  read("src/app/router.jsx"),
  read("src/modules/auth/pages/StudentHomePage.jsx"),
  read("src/modules/auth/hooks/useStudentPortalData.js"),
]);

for (const forbidden of [
  "listAssignedEventReviews",
  "decideEventReview",
  'approvalType: "EVENT"',
  "Event Approval",
  "eventReview",
])
  assert(!approvalCenter.includes(forbidden), `ApprovalCenter still contains ${forbidden}`);

assert.match(
  router,
  /path: "\/adosa"[\s\S]*?basePath="\/adosa\/events"[\s\S]*?path: "events\/:eventId", element: <ReviewerEventDetailPage \/>/,
  "ADoSA Event details must route to ReviewerEventDetailPage"
);
assert.match(studentHome, /useStudentPortalData\(\{ enabled: authReady \}\)/);
for (const readinessCheck of [
  "!auth.authLoading",
  "!auth.contextLoading",
  "Boolean(userId)",
])
  assert(portalHook.includes(readinessCheck), `Missing auth readiness check: ${readinessCheck}`);
assert(portalHook.includes("generation.current"), "Missing stale-result generation guard");

let calls = 0;
let release;
const cache = createStudentPortalDataRequestCache({
  load: async () => {
    calls += 1;
    await new Promise((resolve) => {
      release = resolve;
    });
    return { ...EMPTY_STUDENT_PORTAL_DATA, summary: { calls } };
  },
  ttlMs: 1000,
});
const firstMount = cache.request("student-1");
const strictModeRemount = cache.request("student-1");
assert.equal(calls, 0, "loader begins on the next microtask");
await Promise.resolve();
assert.equal(calls, 1, "parallel/remount loads must coalesce");
release();
await Promise.all([firstMount, strictModeRemount]);
await cache.request("student-1");
assert.equal(calls, 1, "a quick remount must reuse the settled value");

const manualOne = cache.request("student-1", { force: true });
const manualTwo = cache.request("student-1", { force: true });
await Promise.resolve();
assert.equal(calls, 2, "manual refresh starts one new request");
release();
await Promise.all([manualOne, manualTwo]);
assert.equal(calls, 2, "parallel manual refreshes must coalesce");

console.log(
  JSON.stringify(
    {
      passed: true,
      approvalCenterExcludesEventReviews: true,
      adosaUsesReviewerEventDetail: true,
      studentPortalWaitsForAuthReady: true,
      studentPortalRemountRequestsCoalesced: true,
      studentPortalManualRefreshPreserved: true,
    },
    null,
    2
  )
);
