import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  StatusChip,
} from "../../../design-system";
import { listAssignedEventReviews } from "../services/eventApi";
const fmt = (v) => (v ? new Date(v).toLocaleDateString() : "—");
export function AssistantHomePage() {
  const [count, setCount] = useState(null);
  useEffect(() => {
    listAssignedEventReviews({ status: "PENDING", stage: "ASSISTANT_REVIEW" })
      .then((x) => setCount(x.pagination?.totalItems ?? x.items?.length ?? 0))
      .catch(() => setCount(null));
  }, []);
  return (
    <div className="page-stack">
      <PageHeader
        title="Assistant"
        description="Review Event proposals forwarded by Faculty Presidents."
      />
      {count === null ? (
        <Card title="Events">
          <Link to="/assistant/events">Open Events</Link>
        </Card>
      ) : (
        <StatCard label="Events Awaiting Review" value={count} />
      )}
    </div>
  );
}
export function AssistantEventsPage() {
  const [tab, setTab] = useState("awaiting");
  const [state, setState] = useState({ loading: true, items: [], error: "" });
  useEffect(() => {
    const params = { stage: "ASSISTANT_REVIEW" };
    if (tab === "awaiting") params.status = "PENDING";
    else params.view = tab;
    listAssignedEventReviews(params)
      .then((x) =>
        setState({ loading: false, items: x.items || [], error: "" })
      )
      .catch((e) =>
        setState({ loading: false, items: [], error: e.readableMessage })
      );
  }, [tab]);
  return (
    <div className="page-stack events-page">
      <PageHeader
        title="Events"
        description="Event proposals currently assigned to your Assistant review queue."
      />
      <nav className="approval-tabs" aria-label="Assistant Event history">
        {["awaiting", "forwarded", "completed"].map((value) => (
          <button
            className={tab === value ? "active" : ""}
            key={value}
            onClick={() => setTab(value)}
          >
            {value === "awaiting" ? "Awaiting Action" : value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </nav>
      {state.loading ? (
        <Skeleton lines={8} />
      ) : state.error ? (
        <EmptyState title="Events unavailable" description={state.error} />
      ) : !state.items.length ? (
        <EmptyState title={`No ${tab === "awaiting" ? "Events Awaiting Action" : tab} Events`} />
      ) : (
        <div className="event-list">
          {state.items.map((review) => {
            const event = review.eventId;
            return (
              <Link
                className="event-list-item"
                to={`/assistant/events/${event._id}`}
                key={review._id}
              >
                <div>
                  <small>{event.eventCode}</small>
                  <h3>{event.title || "Untitled Event"}</h3>
                  <span>
                    {event.societyId?.name} · {fmt(event.startDate)} —{" "}
                    {fmt(event.endDate)}
                  </span>
                  <small>Forwarded {fmt(review.assignedAt)}</small>
                  {review.decidedAt && <small>Actioned {fmt(review.decidedAt)}</small>}
                </div>
                <StatusChip status={event.status} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
export function AssistantPlaceholderPage({ title }) {
  return (
    <Card title={title}>
      <p>
        This Assistant workspace section will be available in a future
        milestone.
      </p>
    </Card>
  );
}
