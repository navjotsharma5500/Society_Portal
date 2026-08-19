import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Info } from "lucide-react";
import {
  Button,
  EmptyState,
  IconButton,
  Modal,
  PageHeader,
  Skeleton,
  StatusChip,
  Textarea,
  Tooltip,
} from "../../../design-system";
import {
  EventAnnexureSection,
  EventDetailsSection,
  EventGovernanceSection,
  EventPlanningSection,
} from "../components/EventFormSections";
import {
  decideEventReview,
  getReviewEvent,
  saveEventBudgetReview,
} from "../services/eventApi";
import { useToast } from "../../../components/common/toastContext";
import "../events.css";
const date = (v) => (v ? String(v).slice(0, 10) : "");
const formOf = (e) => ({
  ...e,
  startDate: date(e.startDate),
  endDate: date(e.endDate),
  dailySchedule: (e.dailySchedule || []).map((x) => ({
    ...x,
    date: date(x.date),
  })),
});
const Value = ({ label, children }) => (
  <div className="event-value">
    <small>{label}</small>
    <p>{children || "—"}</p>
  </div>
);
export default function ReviewerEventDetailPage() {
  const { eventId } = useParams(),
    location = useLocation(),
    assistantMode = location.pathname.startsWith("/assistant"),
    dosaStaffMode = location.pathname.startsWith("/dosa-staff"),
    navigate = useNavigate(),
    [event, setEvent] = useState(null),
    [form, setForm] = useState(null),
    [editing, setEditing] = useState(false),
    [remarks, setRemarks] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [showBudgetPanel, setShowBudgetPanel] = useState(false),
    { notify } = useToast();
  const load = useCallback(
    () =>
      getReviewEvent(eventId)
        .then((x) => {
          setEvent(x);
          setForm(formOf(x));
        })
        .catch((e) => setError(e.readableMessage)),
    [eventId]
  );
  useEffect(() => {
    load();
  }, [load]);
  const set = (key, value) => setForm((x) => ({ ...x, [key]: value }));
  const decide = async (decision, amend = false) => {
    if ((amend || decision !== "APPROVE") && !remarks.trim()) {
      setError(
        amend
          ? "A reason is required for reviewer amendments."
          : "Remarks are required for this decision."
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      await decideEventReview(
          event.activeReview._id,
          decision,
          remarks.trim() || undefined,
          amend ? form : undefined
        );
      await load();
      setEditing(false);
      setRemarks("");
    } catch (e) {
      const message =
        e.errorCode === "EVENT_REVIEW_ALREADY_DECIDED"
          ? "This Event review has already been decided."
          : e.readableMessage;
      setError(message);
      notify?.(message, "error");
    } finally {
      setSaving(false);
    }
  };
  const saveBudget = async () => {
    setSaving(true);
    setError("");
    try {
      await saveEventBudgetReview(event.activeReview._id, form.budget.items);
      await load();
    } catch (e) {
      setError(e.readableMessage);
      notify?.(e.readableMessage, "error");
    } finally {
      setSaving(false);
    }
  };
  if (error && !event)
    return <EmptyState title="Event unavailable" description={error} />;
  if (!event) return <Skeleton lines={10} />;
  const active = event.activeReview;
  const budgetPosition = event.budgetPosition;
  const overBudget = Boolean(
    dosaStaffMode && budgetPosition && !budgetPosition.unavailable && budgetPosition.projectedRemaining < 0
  );
  return (
    <div className="page-stack events-page">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        Back to Events
      </Button>
      <PageHeader
        title={event.title || "Untitled Event"}
        description={`${event.eventCode} · ${
          event.societyId?.name || "Society"
        }`}
        actions={<StatusChip status={event.status} />}
      />
      {error && <p className="event-warning">{error}</p>}
      {editing ? (
        <>
          <p className="event-warning">
            You are reviewing and amending this proposal as{" "}
            {active?.assignedRoleCode?.replaceAll("_", " ")}.
          </p>
          <EventDetailsSection form={form} set={set} />
          <EventAnnexureSection form={form} set={set} />
          <EventPlanningSection form={form} set={set} />
        </>
      ) : (
        <>
          <section className="event-card">
            <h2>Proposal details</h2>
            <div className="event-grid">
              <Value label="Society">{event.societyId?.name}</Value>
              <Value label="Dates">
                {date(event.startDate)} — {date(event.endDate)}
              </Value>
              <Value label="Mode">{event.annexure?.mode}</Value>
              <Value label="Venue preference">
                {event.venueRequirement?.preferredVenueName}
              </Value>
              <Value label="POC">
                {event.poc?.studentMasterId?.name} ·{" "}
                {event.poc?.label?.replaceAll("_", " ")}
              </Value>
              <Value label="Total budget">
                ₹{event.budget?.totalEstimated || 0}
              </Value>
            </div>
            <Value label="Objective">{event.objective}</Value>
            <Value label="Concept">{event.annexure?.concept}</Value>
            <Value label="Audience">{event.annexure?.targetAudience}</Value>
            <Value label="Expected outcomes">
              {event.annexure?.expectedOutcomes}
            </Value>
            <h3>Daily schedule</h3>
            {event.dailySchedule?.map((x, i) => (
              <p key={i}>
                {date(x.date)} · {x.startTime}–{x.endTime}
              </p>
            ))}
            <h3>Event flow</h3>
            {event.annexure?.eventFlow?.map((x, i) => (
              <p key={i}>
                <b>{x.component}</b> — {x.description}
              </p>
            ))}
            <h3>Speakers / resources</h3>
            {event.annexure?.speakers?.map((x, i) => (
              <p key={i}>
                {x.name} · {x.designation || x.affiliation || "—"}
              </p>
            ))}
            <h3>
              Budget breakup
              {dosaStaffMode && (
                <Tooltip content="View Society Budget">
                  <IconButton
                    label="View Society Budget"
                    onClick={() => setShowBudgetPanel(true)}
                    style={{ marginLeft: 8, verticalAlign: "middle" }}
                  >
                    <Info size={16} />
                  </IconButton>
                </Tooltip>
              )}
            </h3>
            {event.budget?.items?.map((x, i) => (
              <p key={i}>
                {x.head}: {x.quantity} × ₹{x.estimatedUnitCost} = ₹
                {x.estimatedAmount}
              </p>
            ))}
            {dosaStaffMode && (
              <p><b>Total requested:</b> ₹{event.budget?.totalEstimated || 0} · <b>Total recommended:</b> ₹{event.budget?.totalRecommended || 0}</p>
            )}
            {overBudget && (
              <div className="event-warning" role="alert">
                <b>Insufficient Budget Balance</b>
                <p>
                  The Event requirement exceeds the Society's currently available budget. Please review the
                  budget before forwarding this Event.
                </p>
              </div>
            )}
            {dosaStaffMode && budgetPosition?.unavailable && (
              <p className="event-warning">No annual budget is configured for this society and academic session.</p>
            )}
            <h3>Previous events</h3>
            {event.previousEvents?.map((x, i) => (
              <p key={i}>
                {x.title} · ₹{x.budgetUsed || 0} used
              </p>
            ))}
          </section>
          <EventGovernanceSection event={event} />
          <details className="event-card">
            <summary>Revision History</summary>
            {event.amendmentHistory?.length ? (
              event.amendmentHistory.map((x) => (
                <section key={x._id}>
                  <b>
                    {x.changedByRoleCode === "STUDENT"
                      ? "Student revised"
                      : `${x.changedByRoleCode.replaceAll("_", " ")} revised`}{" "}
                    the proposal
                  </b>
                  <p>{x.reason}</p>
                  {(x.summary || x.changes.map((c) => `${c.fieldPath.replaceAll(".", " ")} was updated.`)).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </section>
              ))
            ) : (
              <p>No reviewer amendments.</p>
            )}
          </details>
        </>
      )}
      {active && (
        <section className="event-card">
          <h2>Your review</h2>
          {dosaStaffMode && (
            <div className="page-stack">
              <h3>Item-wise budget review</h3>
              {(form.budget?.items || []).map((item, index) => (
                <div className="event-grid" key={index}>
                  <Value label="Item">{item.head}</Value>
                  <Value label="Requested amount">₹{item.estimatedAmount || 0}</Value>
                  <label>Recommended amount<input className="ds-control" type="number" min="0" value={item.recommendedAmount ?? ""} onChange={(e) => setForm((current) => ({ ...current, budget: { ...current.budget, items: current.budget.items.map((row, i) => i === index ? { ...row, recommendedAmount: e.target.value } : row) } }))}/></label>
                  <label>Review remark<input className="ds-control" value={item.reviewRemark || ""} onChange={(e) => setForm((current) => ({ ...current, budget: { ...current.budget, items: current.budget.items.map((row, i) => i === index ? { ...row, reviewRemark: e.target.value } : row) } }))}/></label>
                </div>
              ))}
              <Button variant="outline" loading={saving} onClick={saveBudget}>Save Budget Review</Button>
            </div>
          )}
          <Textarea
            label={editing ? "Reason for amendment" : dosaStaffMode ? "Decision remarks" : "Remarks"}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
          <div className="event-actions">
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setForm(formOf(event));
                  }}
                >
                  Cancel
                </Button>
                <Button
                  loading={saving}
                  onClick={() => decide("APPROVE", true)}
                >
                  {assistantMode ? "Save" : "Save Amendment & Forward"}
                </Button>
              </>
            ) : (
              <>
                <Button loading={saving} onClick={() => decide("APPROVE")}>
                  {assistantMode
                    ? "FORWARD"
                    : active.stage === "DOSA_REVIEW"
                    ? "Approve"
                    : "Forward as Submitted"}
                </Button>
                {!assistantMode && !dosaStaffMode && active.stage !== "DOSA_REVIEW" && (
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    {assistantMode ? "EDIT" : "Edit & Forward"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => decide("REQUEST_CHANGES")}
                >
                  {assistantMode ? "REQUEST CHANGES" : "Request Changes"}
                </Button>
                {dosaStaffMode && (
                  <Button
                    variant="outline"
                    onClick={() => decide("BUDGET_RECTIFICATION")}
                  >
                    Send for Budget Rectification
                  </Button>
                )}
                <Button variant="danger" onClick={() => decide("REJECT")}>
                  {assistantMode ? "REJECT" : "Reject"}
                </Button>
              </>
            )}
          </div>
        </section>
      )}
      {dosaStaffMode && (
        <Modal
          open={showBudgetPanel}
          onClose={() => setShowBudgetPanel(false)}
          title="Society Budget Position"
        >
          {budgetPosition?.unavailable ? (
            <p className="event-warning">
              No annual budget is configured for this society and academic session.
            </p>
          ) : budgetPosition ? (
            <div className="page-stack">
              <div className="event-grid">
                <Value label="Society">{event.societyId?.name}</Value>
                <Value label="Academic session">{event.academicSession}</Value>
                <Value label="Allocated">₹{budgetPosition.allocatedAmount}</Value>
                <Value label="Utilized">₹{budgetPosition.utilizedAmount}</Value>
                <Value label="Available">₹{budgetPosition.availableAmount}</Value>
                <Value label="Event Requirement">₹{budgetPosition.requestedAmount}</Value>
                <Value label="DoSA Staff Recommended">₹{budgetPosition.recommendedAmount}</Value>
                <Value label="Remaining if recommended is approved">
                  ₹{budgetPosition.projectedRemaining}
                </Value>
              </div>
              {overBudget && (
                <div className="event-warning" role="alert">
                  <b>Insufficient Balance</b>
                  <p>Shortfall: ₹{Math.abs(budgetPosition.projectedRemaining)}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="muted">
              Budget position is only available while this Event is at the DoSA Staff stage.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
