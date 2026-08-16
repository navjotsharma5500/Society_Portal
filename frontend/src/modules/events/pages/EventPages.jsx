import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import {
  createEvent,
  getEvent,
  getLiveEventRequestUsage,
  listSocietyEvents,
  submitEvent,
  updateEvent,
} from "../services/eventApi";
import {
  EventAnnexureSection,
  EventDetailsSection,
  EventGovernanceSection,
  EventPlanningSection,
} from "../components/EventFormSections";
import "../events.css";

const blank = {
  title: "",
  startDate: "",
  endDate: "",
  dailySchedule: [],
  venueRequirement: { required: false, preferredVenueName: "", notes: "" },
  objective: "",
  annexure: {
    concept: "",
    mode: "",
    speakers: [],
    targetAudience: "",
    expectedOutcomes: "",
    eventFlow: [],
  },
  previousEvents: [],
  budget: { items: [] },
  poc: { label: "GENERAL_SECRETARY" },
};
const permission = (context, code) =>
  (context?.permissions || []).some((item) => (item.code || item) === code);
const date = (value) => (value ? String(value).slice(0, 10) : "");
const statusLabel = (status) =>
  ({
    FACULTY_REVIEW: "Pending Faculty Review",
    ASSISTANT_REVIEW: "Pending Assistant Review",
    DOSA_STAFF_REVIEW: "Pending DoSA Staff Review",
    ADOSA_REVIEW: "Pending ADoSA Review",
    ADMIN_REVIEW: "Pending Admin Review",
    CHANGES_REQUESTED: "Changes Requested",
    REJECTED: "Rejected",
    APPROVED: "Approved",
    DRAFT: "Draft",
  }[status] || status?.replaceAll("_", " "));
const sectionForField = (field) => {
  if (
    field.startsWith("dailySchedule") ||
    field === "startDate" ||
    field === "endDate"
  )
    return "event-schedule";
  if (field === "objective" || field === "title") return "event-details";
  if (field.startsWith("annexure")) return "event-annexure";
  if (field.startsWith("budget")) return "event-budget";
  if (field.startsWith("facultyReviewContext") || field === "poc")
    return "event-faculty";
  return "event-details";
};
const editable = (event) =>
  event
    ? {
        ...blank,
        title: event.title || "",
        startDate: date(event.startDate),
        endDate: date(event.endDate),
        dailySchedule: (event.dailySchedule || []).map((row) => ({
          ...row,
          date: date(row.date),
        })),
        venueRequirement: event.venueRequirement || blank.venueRequirement,
        objective: event.objective || "",
        annexure: event.annexure || blank.annexure,
        previousEvents: event.previousEvents || [],
        budget: event.budget || blank.budget,
        poc: { label: event.poc?.label || "GENERAL_SECRETARY" },
      }
    : blank;

export function SocietyEventsPage() {
  const { selectedContext } = useOutletContext(),
    [events, setEvents] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (!selectedContext?.societyId) return;
    listSocietyEvents(selectedContext.societyId)
      .then((data) => setEvents(data.items || []))
      .catch((e) => setError(e.readableMessage));
  }, [selectedContext?.societyId]);
  return (
    <div className="events-page">
      <header className="events-heading">
        <div>
          <p>Society workspace</p>
          <h1>Events</h1>
          <span>Draft, review, and submit event proposals.</span>
        </div>
        {permission(selectedContext, "event.create") && (
          <Link className="event-primary" to="/student/events/new">
            Create event
          </Link>
        )}
      </header>
      {error && <p className="event-warning">{error}</p>}
      <div className="event-list">
        {events.map((event) => (
          <Link
            to={`/student/events/${event._id}${
              event.status === "DRAFT" &&
              permission(selectedContext, "event.edit_own")
                ? "/edit"
                : ""
            }`}
            className="event-list-item"
            key={event._id}
          >
            <div>
              <small>{event.eventCode}</small>
              <h3>{event.title || "Untitled event"}</h3>
              <span>{date(event.startDate) || "Dates not set"}</span>
            </div>
            <b className={`event-status ${event.status.toLowerCase()}`}>
              {statusLabel(event.status)}
            </b>
          </Link>
        ))}
        {!events.length && !error && (
          <div className="event-empty">
            No events are visible in this society yet.
          </div>
        )}
      </div>
    </div>
  );
}

export function EventEditorPage() {
  const { eventId } = useParams(),
    { selectedContext } = useOutletContext(),
    navigate = useNavigate(),
    [form, setForm] = useState(blank),
    [event, setEvent] = useState(null),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState([]),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (eventId)
      getEvent(eventId)
        .then((value) => {
          setEvent(value);
          setForm(editable(value));
        })
        .catch((e) => setError(e.readableMessage));
  }, [eventId]);
  const set = (key, value) =>
      setForm((current) => ({ ...current, [key]: value })),
    save = async () => {
      setSaving(true);
      setError("");
      setFieldErrors([]);
      try {
        const value = eventId
          ? await updateEvent(eventId, form)
          : await createEvent({
              ...form,
              societyId: selectedContext?.societyId,
            });
        setEvent(value);
        setForm(editable(value));
        if (!eventId)
          navigate(`/student/events/${value._id}/edit`, { replace: true });
        return value;
      } catch (e) {
        const responseError = e.response?.data?.error || {},
          fields = Array.isArray(responseError.fields)
            ? responseError.fields
            : [];
        setError(responseError.message || e.readableMessage);
        setFieldErrors(fields);
        if (import.meta.env.DEV)
          console.warn({
            event: "EVENT_OPERATION_FAILED",
            operation: eventId ? "updateDraft" : "createDraft",
            status: e.response?.status,
            code: responseError.code || e.errorCode,
            message: responseError.message || e.readableMessage,
            fields,
          });
        const first =
          fields[0]?.field &&
          document.getElementById(sectionForField(fields[0].field));
        if (first)
          setTimeout(
            () => first.scrollIntoView({ behavior: "smooth", block: "center" }),
            0
          );
        return null;
      } finally {
        setSaving(false);
      }
    };
  const review = async () => {
    const value = await save();
    if (value) navigate(`/student/events/${value._id}/review`);
  };
  if (!eventId && !permission(selectedContext, "event.create"))
    return (
      <p className="event-warning">
        Your active society role cannot create events.
      </p>
    );
  return (
    <div className="events-page">
      <header className="events-heading">
        <div>
          <p>{event?.eventCode || "New proposal"}</p>
          <h1>{eventId ? "Edit event" : "Create event"}</h1>
          <span>Incomplete drafts can be saved at any time.</span>
        </div>
        <b className="event-status draft">{event?.status || "DRAFT"}</b>
      </header>
      {error && (
        <div className="event-warning" role="alert">
          <b>{error}</b>
          {fieldErrors.length > 0 && (
            <ul>
              {fieldErrors.map((item) => (
                <li key={item.field}>{item.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <section className="event-card">
        <div className="event-grid">
          <Value label="Society">
            {event?.societyId?.name || selectedContext?.societyName}
          </Value>
          <Value label="Created by">
            {selectedContext?.roleName ||
              event?.poc?.label?.replaceAll("_", " ")}
          </Value>
        </div>
      </section>
      <div id="event-details">
        <div
          id="event-schedule"
          className={
            fieldErrors.some((item) =>
              ["event-details", "event-schedule"].includes(
                sectionForField(item.field)
              )
            )
              ? "event-card-invalid"
              : ""
          }
        >
          <EventDetailsSection form={form} set={set} />
        </div>
      </div>
      <div
        id="event-annexure"
        className={
          fieldErrors.some(
            (item) => sectionForField(item.field) === "event-annexure"
          )
            ? "event-card-invalid"
            : ""
        }
      >
        <EventAnnexureSection form={form} set={set} />
      </div>
      <div
        id="event-budget"
        className={
          fieldErrors.some(
            (item) => sectionForField(item.field) === "event-budget"
          )
            ? "event-card-invalid"
            : ""
        }
      >
        <EventPlanningSection form={form} set={set} />
      </div>
      <div id="event-faculty">
        <EventGovernanceSection event={event} />
      </div>
      <div className="event-actions">
        <button className="event-secondary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button className="event-primary" disabled={saving} onClick={review}>
          Review proposal
        </button>
      </div>
    </div>
  );
}

const Value = ({ label, children }) => (
  <div className="event-value">
    <small>{label}</small>
    <p>{children || "—"}</p>
  </div>
);
export function EventDetailPage({ review = false }) {
  const { eventId } = useParams(),
    navigate = useNavigate(),
    [event, setEvent] = useState(null),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState([]),
    [liveUsage, setLiveUsage] = useState(null);
  useEffect(() => {
    getEvent(eventId)
      .then(setEvent)
      .catch((e) => setError(e.readableMessage));
  }, [eventId]);
  useEffect(() => { if (review) getLiveEventRequestUsage(eventId).then(setLiveUsage).catch(() => {}); }, [eventId, review]);
  const submit = async () => {
    try {
      setError("");
      setFieldErrors([]);
      setEvent(await submitEvent(eventId));
      navigate(`/student/events/${eventId}`, { replace: true });
    } catch (e) {
      const responseError = e.response?.data?.error || {},
        fields = Array.isArray(responseError.fields)
          ? responseError.fields
          : [];
      setError(responseError.message || e.readableMessage);
      setFieldErrors(fields);
      if (import.meta.env.DEV)
        console.warn({
          event: "EVENT_OPERATION_FAILED",
          operation: "submit",
          status: e.response?.status,
          code: responseError.code || e.errorCode,
          message: responseError.message || e.readableMessage,
          fields,
        });
      const first =
        fields[0]?.field &&
        document.getElementById(sectionForField(fields[0].field));
      if (first)
        setTimeout(
          () => first.scrollIntoView({ behavior: "smooth", block: "center" }),
          0
        );
    }
  };
  if (error && !event) return <p className="event-warning">{error}</p>;
  if (!event) return <p>Loading event…</p>;
  return (
    <div className="events-page">
      <header className="events-heading">
        <div>
          <p>{event.eventCode}</p>
          <h1>
            {review ? "Review proposal" : event.title || "Untitled event"}
          </h1>
          <span>
            {review
              ? "Confirm the structured proposal before submission."
              : "Read-only event record"}
          </span>
        </div>
        <b className={`event-status ${event.status.toLowerCase()}`}>
          {event.status.replaceAll("_", " ")}
        </b>
      </header>
      {error && (
        <div className="event-warning" role="alert">
          <b>{error}</b>
          {fieldErrors.length > 0 && (
            <ul>
              {fieldErrors.map((item) => (
                <li key={item.field}>{item.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <section
        id="event-details"
        className={`event-card ${
          fieldErrors.some(
            (item) => sectionForField(item.field) === "event-details"
          )
            ? "event-card-invalid"
            : ""
        }`}
      >
        <h2>Proposal summary</h2>
        <div className="event-grid">
          <Value label="Title">{event.title}</Value>
          <Value label="Dates">
            {date(event.startDate)} — {date(event.endDate)}
          </Value>
          <Value label="Venue preference">
            {event.venueRequirement?.preferredVenueName}
          </Value>
          <Value label="Mode">{event.annexure?.mode}</Value>
        </div>
        <Value label="Objective">{event.objective}</Value>
        <Value label="Concept">{event.annexure?.concept}</Value>
        <Value label="Audience">{event.annexure?.targetAudience}</Value>
        <Value label="Expected outcomes">
          {event.annexure?.expectedOutcomes}
        </Value>
      </section>
      <section
        id="event-schedule"
        className={`event-card ${
          fieldErrors.some((item) =>
            ["event-schedule", "event-annexure"].includes(
              sectionForField(item.field)
            )
          )
            ? "event-card-invalid"
            : ""
        }`}
      >
        <h2>Schedule & flow</h2>
        {event.dailySchedule?.map((row) => (
          <p key={row.date}>
            {date(row.date)} · {row.startTime}–{row.endTime}
          </p>
        ))}
        {event.annexure?.eventFlow?.map((row) => (
          <p key={row.order}>
            <b>
              {row.order + 1}. {row.component}
            </b>{" "}
            — {row.description}
          </p>
        ))}
      </section>
      <section
        id="event-budget"
        className={`event-card ${
          fieldErrors.some(
            (item) => sectionForField(item.field) === "event-budget"
          )
            ? "event-card-invalid"
            : ""
        }`}
      >
        <h2>Budget & speakers</h2>
        <p>
          Total estimate: <b>₹{event.budget?.totalEstimated || 0}</b>
        </p>
        {event.budget?.items?.map((row, index) => (
          <p key={index}>
            {row.head}: {row.quantity} × ₹{row.estimatedUnitCost} = ₹
            {row.estimatedAmount}
          </p>
        ))}
        {event.annexure?.speakers?.map((row, index) => (
          <p key={index}>
            {row.name} ·{" "}
            {row.affiliation || row.designation || "No affiliation"} ·{" "}
            {row.approvalStatus}
          </p>
        ))}
      </section>
      <div
        id="event-faculty"
        className={
          fieldErrors.some(
            (item) => sectionForField(item.field) === "event-faculty"
          )
            ? "event-card-invalid"
            : ""
        }
      >
        <EventGovernanceSection event={event} />
      </div>
      {event.amendmentHistory?.length > 0 && (
        <details className="event-card" open>
          <summary>Proposal Revision History</summary>
          {event.amendmentHistory.map((amendment) => (
            <section key={amendment._id}>
              <h3>
                {amendment.changedByRoleCode.replaceAll("_", " ")} revised the
                proposal
              </h3>
              <p>Reason: {amendment.reason}</p>
              {amendment.changes.map((change) => (
                <p key={change.fieldPath}>
                  <b>{change.fieldPath.replaceAll(".", " ")}</b>
                  <br />
                  {JSON.stringify(change.oldValue)} →{" "}
                  {JSON.stringify(change.newValue)}
                </p>
              ))}
            </section>
          ))}
        </details>
      )}
      {event.status === "CHANGES_REQUESTED" && (
        <section className="event-card">
          <h2>Changes Requested</h2>
          {[...(event.reviewHistory || [])]
            .reverse()
            .filter((x) => x.status === "CHANGES_REQUESTED")
            .slice(0, 1)
            .map((x) => (
              <div key={x._id}>
                <p>
                  Changes Requested by {x.assignedRoleCode.replaceAll("_", " ")}
                </p>
                <p>Reason: {x.remarks}</p>
              </div>
            ))}
        </section>
      )}
      {review && ["DRAFT", "CHANGES_REQUESTED"].includes(event.status) && (
        <div className="event-actions">
          <Link
            className="event-secondary"
            to={`/student/events/${eventId}/edit`}
          >
            Back to edit
          </Link>
          {liveUsage && !liveUsage.available && <p className="event-warning">{liveUsage.current} of {liveUsage.limit} active event requests currently in approval. You can submit another request after one reaches a terminal state.</p>}
          <button className="event-primary" disabled={liveUsage && !liveUsage.available} onClick={submit}>
            Submit proposal
          </button>
        </div>
      )}
      {!review && event.isCreator && event.status === "CHANGES_REQUESTED" && (
        <div className="event-actions">
          <Link
            className="event-primary"
            to={`/student/events/${eventId}/edit`}
          >
            Correct Event
          </Link>
        </div>
      )}
    </div>
  );
}
