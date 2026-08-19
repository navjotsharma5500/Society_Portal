import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, PageHeader, Skeleton, StatusChip } from "../../../design-system";
import { listAssignedEventReviews } from "../services/eventApi";
const fmt = (value) => (value ? new Date(value).toLocaleDateString() : "—");
const TABS = [
  { key: "PENDING", label: "Pending with DoSA" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];
export function DosaEventsPage() {
  const [tab, setTab] = useState("PENDING");
  const [state, setState] = useState({ loading: true, items: [], error: "" });
  useEffect(() => {
    setState((old) => ({ ...old, loading: true, error: "" }));
    listAssignedEventReviews({ status: tab })
      .then((result) =>
        setState({ loading: false, items: result.items || [], error: "" })
      )
      .catch((error) =>
        setState({ loading: false, items: [], error: error.readableMessage })
      );
  }, [tab]);
  return (
    <div className="page-stack">
      <PageHeader
        title="Event Approvals"
        description="Event proposals currently assigned to your DoSA final-approval queue."
      />
      <nav className="approval-tabs" aria-label="DoSA event queue">
        {TABS.map(({ key, label }) => (
          <button
            className={tab === key ? "active" : ""}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {state.loading ? (
        <Skeleton lines={8} />
      ) : state.error ? (
        <EmptyState title="Events unavailable" description={state.error} />
      ) : !state.items.length ? (
        <EmptyState
          title={`No events ${tab === "PENDING" ? "pending" : tab.toLowerCase()}`}
        />
      ) : (
        <div className="workspace-table">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Society</th>
                <th>Dates</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((review) => {
                const event = review.eventId;
                return (
                  <tr key={review._id}>
                    <td>
                      <Link to={`/dosa/events/${event._id}`}>
                        <b>{event.eventCode}</b>
                        <small>{event.title || "Untitled Event"}</small>
                      </Link>
                    </td>
                    <td>{event.societyId?.name || "—"}</td>
                    <td>
                      {fmt(event.startDate)} – {fmt(event.endDate)}
                    </td>
                    <td>
                      <StatusChip status={event.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
