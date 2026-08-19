// Safe reconciliation for the Event Budget Deduction integrity fix.
// Default mode is a DRY RUN report: it never writes anything.
//
// Usage:
//   node scripts/reconcile-event-budget-utilization.js
//     -> reports every APPROVED event with a positive sanctioned budget that is
//        missing its final-approval utilization transaction.
//
//   node scripts/reconcile-event-budget-utilization.js --repair=<eventId> --actor=<userId>
//     -> repairs exactly one event. Idempotent: safe to re-run.
const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const reconciliation = require("../src/modules/events/eventBudgetReconciliation.service");

const flag = (name) => {
  const arg = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : null;
};

(async () => {
  await connectDatabase();
  try {
    const repairEventId = flag("repair");
    if (repairEventId) {
      const actorId = flag("actor");
      if (!actorId) {
        console.error("Refusing to repair without --actor=<userId> (needed for the audit trail).");
        process.exitCode = 1;
        return;
      }
      const result = await reconciliation.repairEvent(repairEventId, { actorId });
      console.log(JSON.stringify({ mode: "REPAIR", eventId: repairEventId, ...result }, null, 2));
      return;
    }
    const report = await reconciliation.buildReport();
    console.log(JSON.stringify({ mode: "DRY_RUN", ...report }, null, 2));
    if (report.missingCount > 0) {
      console.log(
        `\n${report.missingCount} approved event(s) are missing a budget utilization transaction.`,
        "Re-run with --repair=<eventId> --actor=<userId> to fix one specific event."
      );
    }
  } finally {
    await disconnectDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
