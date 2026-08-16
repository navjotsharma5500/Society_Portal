import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, EmptyState, PageHeader, Skeleton, StatCard, StatusChip } from "../../../design-system";
import { listAssignedEventReviews } from "../services/eventApi";
const fmt = (value) => value ? new Date(value).toLocaleDateString() : "—";
const loadQueue = () => listAssignedEventReviews({ status: "PENDING", stage: "DOSA_STAFF_REVIEW" });
export function DosaStaffHomePage() {
  const [count, setCount] = useState(null);
  useEffect(() => { loadQueue().then((data) => setCount(data.pagination?.totalItems ?? 0)).catch(() => setCount(null)); }, []);
  return <div className="page-stack"><PageHeader title="DoSA Staff" description="Review Event budgets forwarded by the Assistant."/>{count == null ? <Card title="Events"><Link to="/dosa-staff/events">Open Events</Link></Card> : <StatCard label="Awaiting Budget Review" value={count}/>}</div>;
}
export function DosaStaffEventsPage() {
  const [state, setState] = useState({ loading: true, items: [], error: "" });
  useEffect(() => { loadQueue().then((data) => setState({ loading: false, items: data.items || [], error: "" })).catch((error) => setState({ loading: false, items: [], error: error.readableMessage })); }, []);
  return <div className="page-stack events-page"><PageHeader title="Events" description="Events awaiting item-wise budget review."/>{state.loading ? <Skeleton lines={8}/> : state.error ? <EmptyState title="Events unavailable" description={state.error}/> : !state.items.length ? <EmptyState title="No Events Awaiting Budget Review"/> : <div className="event-list">{state.items.map((review) => { const event = review.eventId; return <Link className="event-list-item" to={`/dosa-staff/events/${event._id}`} key={review._id}><div><small>{event.eventCode}</small><h3>{event.title || "Untitled Event"}</h3><span>{event.societyId?.name} · {fmt(event.startDate)} — {fmt(event.endDate)}</span><small>Requested/current budget: ₹{event.budget?.totalRecommended ?? event.budget?.totalEstimated ?? 0}</small></div><StatusChip status={event.status}/></Link>; })}</div>}</div>;
}
export function DosaStaffPlaceholderPage({ title }) { return <Card title={title}><p>This DoSA Staff workspace section will be available in a future milestone.</p></Card>; }
