import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  StatusChip,
  Textarea,
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
    [saving, setSaving] = useState(false);
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
      setError(
        e.errorCode === "EVENT_REVIEW_ALREADY_DECIDED"
          ? "This Event review has already been decided."
          : e.readableMessage
      );
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
    } finally {
      setSaving(false);
    }
  };
  if (error && !event)
    return <EmptyState title="Event unavailable" description={error} />;
  if (!event) return <Skeleton lines={10} />;
  const active = event.activeReview;
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
            <h3>Budget breakup</h3>
            {event.budget?.items?.map((x, i) => (
              <p key={i}>
                {x.head}: {x.quantity} × ₹{x.estimatedUnitCost} = ₹
                {x.estimatedAmount}
              </p>
            ))}
            {dosaStaffMode && (
              <p><b>Total requested:</b> ₹{event.budget?.totalEstimated || 0} · <b>Total recommended:</b> ₹{event.budget?.totalRecommended || 0}</p>
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
                    {x.changedByRoleCode.replaceAll("_", " ")} revised the
                    proposal
                  </b>
                  <p>{x.reason}</p>
                  {x.changes.map((c) => (
                    <p key={c.fieldPath}>
                      {c.fieldPath}: {JSON.stringify(c.oldValue)} →{" "}
                      {JSON.stringify(c.newValue)}
                    </p>
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
                {!assistantMode && !dosaStaffMode && (
                  <Button
                    variant="outline"
                    onClick={() => decide("REQUEST_CHANGES")}
                  >
                    Request Changes
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
    </div>
  );
}
