import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, EmptyState, PageHeader, Skeleton, StatCard, StatusChip } from "../../../design-system";
import { listAssignedEventReviews } from "../services/eventApi";
const fmt = (value) => value ? new Date(value).toLocaleDateString() : "—";
const loadQueue = () => listAssignedEventReviews({ status: "PENDING", stage: "DOSA_STAFF_REVIEW" });
// Shared rule with the backend's resolveSanctionedBudgetAmount(): the recommendation only counts
// once DoSA Staff has actually entered one (> 0); a default/untouched 0 must fall back to requested.
const budgetTileLabel = (budget) => {
  const requested = budget?.totalEstimated || 0;
  const recommended = budget?.totalRecommended || 0;
  return recommended > 0
    ? `Requested: ₹${requested} · Recommended: ₹${recommended}`
    : `Requested budget: ₹${requested}`;
};
export function DosaStaffHomePage() {
  const [count, setCount] = useState(null);
  useEffect(() => { loadQueue().then((data) => setCount(data.pagination?.totalItems ?? 0)).catch(() => setCount(null)); }, []);
  return <div className="page-stack"><PageHeader title="DoSA Staff" description="Review Event budgets forwarded by the Assistant."/>{count == null ? <Card title="Events"><Link to="/dosa-staff/events">Open Events</Link></Card> : <StatCard label="Awaiting Budget Review" value={count}/>}</div>;
}
export function DosaStaffEventsPage() {
  const [tab, setTab] = useState("awaiting");
  const [state, setState] = useState({ loading: true, items: [], error: "" });
  useEffect(() => {
    const params = { stage: "DOSA_STAFF_REVIEW" };
    if (tab === "awaiting") params.status = "PENDING";
    else params.view = tab;
    listAssignedEventReviews(params)
      .then((data) => setState({ loading: false, items: data.items || [], error: "" }))
      .catch((error) => setState({ loading: false, items: [], error: error.readableMessage }));
  }, [tab]);
  return (
    <div className="page-stack events-page">
      <PageHeader title="Events" description="Events awaiting item-wise budget review." />
      <nav className="approval-tabs" aria-label="DoSA Staff Event history">
        {["awaiting", "forwarded", "completed"].map((value) => (
          <button className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)}>
            {value === "awaiting" ? "Awaiting Action" : value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </nav>
      {state.loading ? (
        <Skeleton lines={8} />
      ) : state.error ? (
        <EmptyState title="Events unavailable" description={state.error} />
      ) : !state.items.length ? (
        <EmptyState title={tab === "awaiting" ? "No Events Awaiting Budget Review" : `No ${tab} Events`} />
      ) : (
        <div className="event-list">
          {state.items.map((review) => {
            const event = review.eventId;
            return (
              <Link className="event-list-item" to={`/dosa-staff/events/${event._id}`} key={review._id}>
                <div>
                  <small>{event.eventCode}</small>
                  <h3>{event.title || "Untitled Event"}</h3>
                  <span>{event.societyId?.name} · {fmt(event.startDate)} — {fmt(event.endDate)}</span>
                  <small>{budgetTileLabel(event.budget)}</small>
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
export function DosaStaffPlaceholderPage({ title }) { return <Card title={title}><p>This DoSA Staff workspace section will be available in a future milestone.</p></Card>; }
