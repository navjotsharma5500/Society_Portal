// Safe reconciliation for Event workflow / EventReview integrity.
//
// Background: a historical bug in eventWorkflow.service.js's decide() assigned the NEXT workflow
// stage's review whenever a routing "next" stage existed — regardless of the actual decision. That
// meant REQUEST_CHANGES / BUDGET_RECTIFICATION / REJECT could leave a dangling PENDING review on a
// later stage (e.g. an orphaned ADoSA PENDING review) even though the Event had already been sent
// back to the Student for a new attempt. A stale PENDING review like that could still be actioned,
// and — worst case — could mutate an Event that has since reached APPROVED. This script finds and
// (in --repair mode) neutralizes exactly that kind of impossible state, without ever deleting
// history or altering budget transactions.
//
// Default mode is a DRY RUN report: it never writes anything.
//
// Usage:
//   node scripts/reconcile-event-review-state.js
//     -> reports every EventReview that is PENDING but not actually actionable.
//
//   node scripts/reconcile-event-review-state.js --repair
//     -> repairs every event this script can safely reconcile. Idempotent: safe to re-run.
//
//   node scripts/reconcile-event-review-state.js --event=<eventId> [--repair]
//     -> scopes the dry run / repair to a single Event.
//
// stdout carries exactly one JSON report (safe to pipe/parse); human-readable hints go to stderr.
process.env.GOOGLE_CLIENT_ID ||= "verification-client";
process.env.JWT_ACCESS_SECRET ||= "verification-access-secret-32-characters-long";
process.env.JWT_REFRESH_SECRET ||= "verification-refresh-secret-32-characters-long";
const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const mongoose = require("mongoose");
const Event = require("../src/modules/events/event.model");
const Review = require("../src/modules/events/eventReview.model");
const Audit = require("../src/modules/events/eventAudit.model");
const workflow = require("../src/modules/events/eventWorkflow.service");
const { ACTIVE_WORKFLOW_STAGES, LEGACY_WORKFLOW_STAGES } = require("../src/modules/events/event.constants");

const activeStages = Object.freeze(Object.values(ACTIVE_WORKFLOW_STAGES));
const legacyAssistantStage = LEGACY_WORKFLOW_STAGES.ASSISTANT_REVIEW;
const terminalStatuses = Object.freeze(["APPROVED", "REJECTED", "CANCELLED"]);

const args = process.argv.slice(2);
const repair = args.includes("--repair");
const eventArg = args.find((a) => a.startsWith("--event="));
const eventId = eventArg ? eventArg.slice("--event=".length) : null;
const unexpected = args.filter((a) => a !== "--repair" && !a.startsWith("--event="));
if (unexpected.length) {
  console.error(`Unsupported argument(s): ${unexpected.join(", ")}`);
  process.exit(1);
}
if (eventId && !mongoose.Types.ObjectId.isValid(eventId)) {
  console.error(`--event value is not a valid ObjectId: ${eventId}`);
  process.exit(1);
}

// Classifies every currently-PENDING review against its Event's live workflow position. A review is
// only "correct" when it is the single actionable review for the Event's current attempt/stage.
// Everything else is impossible state left over from old buggy behavior (or, transiently, a genuine
// legacy Assistant review that is still active and needs rerouting rather than plain superseding).
const classify = (review, event) => {
  const isTerminal = terminalStatuses.includes(event.status);
  const isLegacyAssistantActive =
    !isTerminal && event.status === legacyAssistantStage && event.currentStage === legacyAssistantStage;
  const isLiveActiveStage =
    !isTerminal && !isLegacyAssistantActive && activeStages.includes(event.status) && event.status === event.currentStage;

  if (isLegacyAssistantActive && review.stage === legacyAssistantStage && review.attempt === event.revision)
    return { ok: false, kind: "LEGACY_ASSISTANT_ACTIVE" };

  const isCorrect =
    isLiveActiveStage && review.stage === event.status && review.attempt === event.revision;
  if (isCorrect) return { ok: true };

  if (isTerminal) return { ok: false, kind: "PENDING_ON_TERMINAL_EVENT" };
  if (review.attempt < event.revision) return { ok: false, kind: "STALE_ATTEMPT" };
  if (review.stage !== event.currentStage || review.stage !== event.status)
    return { ok: false, kind: "STALE_STAGE" };
  return { ok: false, kind: "IMPOSSIBLE_DUPLICATE_PENDING" };
};

async function buildFindings() {
  const eventFilter = eventId ? { _id: eventId } : {};
  const pending = await Review.find({ status: "PENDING" }).lean();
  const relevant = eventId ? pending.filter((r) => String(r.eventId) === eventId) : pending;
  if (!relevant.length) return [];
  const events = await Event.find({ _id: { $in: relevant.map((r) => r.eventId) }, ...eventFilter })
    .select("_id status currentStage revision eventCode submittedByUserId createdByUserId")
    .lean();
  const eventById = new Map(events.map((e) => [String(e._id), e]));
  const findings = [];
  for (const review of relevant) {
    const event = eventById.get(String(review.eventId));
    if (!event) continue;
    const result = classify(review, event);
    if (result.ok) continue;
    findings.push({
      kind: result.kind,
      eventId: String(event._id),
      eventCode: event.eventCode,
      eventStatus: event.status,
      eventCurrentStage: event.currentStage,
      eventRevision: event.revision,
      reviewId: String(review._id),
      reviewStage: review.stage,
      reviewAttempt: review.attempt,
      reviewAssignedRoleCode: review.assignedRoleCode,
    });
  }
  return findings;
}

async function repairFindings(findings) {
  const outcomes = [];
  const plain = findings.filter((f) => f.kind !== "LEGACY_ASSISTANT_ACTIVE");
  const plainByEvent = new Map();
  for (const f of plain) {
    if (!plainByEvent.has(f.eventId)) plainByEvent.set(f.eventId, []);
    plainByEvent.get(f.eventId).push(f);
  }
  for (const [eid, group] of plainByEvent) {
    const reviewIds = group.map((f) => new mongoose.Types.ObjectId(f.reviewId));
    // Idempotent: only touches rows still PENDING, so a concurrent legitimate decision always wins.
    const result = await Review.updateMany(
      { _id: { $in: reviewIds }, status: "PENDING" },
      { $set: { status: "SUPERSEDED" } }
    );
    const event = await Event.findById(eid).select("submittedByUserId createdByUserId eventCode").lean();
    if (result.modifiedCount > 0 && event)
      await Audit.create({
        eventId: eid,
        action: "EVENT_REVIEW_STATE_RECONCILED",
        actorUserId: event.submittedByUserId || event.createdByUserId,
        metadata: {
          supersededReviewIds: reviewIds.map(String),
          reasons: group.map((f) => f.kind),
          script: "reconcile-event-review-state.js",
        },
      });
    outcomes.push({ eventId: eid, eventCode: event?.eventCode, kind: "SUPERSEDED", count: result.modifiedCount });
  }

  const legacy = findings.filter((f) => f.kind === "LEGACY_ASSISTANT_ACTIVE");
  const legacyEventIds = [...new Set(legacy.map((f) => f.eventId))];
  for (const eid of legacyEventIds) {
    const event = await Event.findById(eid);
    if (!event) continue;
    // Re-verify freshness under load: only repair an Event that is STILL genuinely, currently
    // sitting at legacy ASSISTANT_REVIEW — never touch one that has since moved on (or been
    // reconciled by a concurrent run).
    if (event.status !== legacyAssistantStage || event.currentStage !== legacyAssistantStage) {
      outcomes.push({ eventId: eid, eventCode: event.eventCode, kind: "SKIPPED_NO_LONGER_ACTIVE_ASSISTANT" });
      continue;
    }
    const supersedeResult = await Review.updateMany(
      { eventId: eid, stage: legacyAssistantStage, status: "PENDING" },
      { $set: { status: "SUPERSEDED" } }
    );
    event.status = ACTIVE_WORKFLOW_STAGES.DOSA_STAFF_REVIEW;
    event.currentStage = ACTIVE_WORKFLOW_STAGES.DOSA_STAFF_REVIEW;
    await event.save();
    await Audit.create({
      eventId: eid,
      action: "EVENT_REVIEW_STATE_RECONCILED",
      actorUserId: event.submittedByUserId || event.createdByUserId,
      metadata: {
        repair: "LEGACY_ASSISTANT_ACTIVE_REROUTED",
        supersededAssistantReviews: supersedeResult.modifiedCount,
        newStage: ACTIVE_WORKFLOW_STAGES.DOSA_STAFF_REVIEW,
        attempt: event.revision,
        script: "reconcile-event-review-state.js",
      },
    });
    // assign() is itself idempotent (unique eventId+attempt+stage index — a duplicate create just
    // returns the existing review), so a repair re-run never creates two DOSA_STAFF_REVIEW rows.
    try {
      await workflow.assign(event, ACTIVE_WORKFLOW_STAGES.DOSA_STAFF_REVIEW, event.revision);
      outcomes.push({ eventId: eid, eventCode: event.eventCode, kind: "LEGACY_ASSISTANT_REROUTED_TO_DOSA_STAFF" });
    } catch (error) {
      outcomes.push({
        eventId: eid,
        eventCode: event.eventCode,
        kind: "LEGACY_ASSISTANT_REROUTE_FAILED",
        error: error.code || error.message,
      });
    }
  }
  return outcomes;
}

(async () => {
  await connectDatabase();
  try {
    const findings = await buildFindings();
    if (!repair) {
      console.log(
        JSON.stringify(
          {
            mode: "DRY_RUN",
            scope: eventId ? { eventId } : "ALL_EVENTS",
            impossiblePendingCount: findings.length,
            findings,
          },
          null,
          2
        )
      );
      if (findings.length)
        console.error(
          `\n${findings.length} impossible PENDING EventReview record(s) found.`,
          "Re-run with --repair (optionally --event=<eventId>) to mark them SUPERSEDED / reroute legacy Assistant reviews."
        );
      return;
    }
    const outcomes = await repairFindings(findings);
    console.log(
      JSON.stringify(
        {
          mode: "REPAIR",
          scope: eventId ? { eventId } : "ALL_EVENTS",
          impossiblePendingFound: findings.length,
          outcomes,
        },
        null,
        2
      )
    );
  } finally {
    await disconnectDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
