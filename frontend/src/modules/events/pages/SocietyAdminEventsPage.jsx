import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  StatusChip,
} from "../../../design-system";
import { listSocietyEvents } from "../services/eventApi";
import "../events.css";

export default function SocietyAdminEventsPage() {
  const { societyId } = useParams();
  const [status, setStatus] = useState("");
  const [state, setState] = useState({ loading: true, items: [], error: "" });
  useEffect(() => {
    setState((x) => ({ ...x, loading: true, error: "" }));
    listSocietyEvents(societyId, {
      excludeDrafts: true,
      ...(status ? { status } : {}),
    })
      .then((x) =>
        setState({ loading: false, items: x.items || [], error: "" })
      )
      .catch((e) =>
        setState({ loading: false, items: [], error: e.readableMessage })
      );
  }, [societyId, status]);
  return (
    <div className="page-stack events-page">
      <PageHeader
        title="Society Events"
        description="Submitted, reviewed, and approved society event proposals."
        actions={
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "", label: "All statuses" },
              "FACULTY_REVIEW",
              "ASSISTANT_REVIEW",
              "DOSA_STAFF_REVIEW",
              "ADMIN_REVIEW",
              "CHANGES_REQUESTED",
              "REJECTED",
              "APPROVED",
            ]}
          />
        }
      />
      {state.loading ? (
        <Skeleton lines={8} />
      ) : state.error ? (
        <EmptyState title="Events unavailable" description={state.error} />
      ) : !state.items.length ? (
        <EmptyState
          title="No submitted events found"
          description="Private drafts are not shown in this workspace."
        />
      ) : (
        <div className="event-list">
          {state.items.map((event) => (
            <Link
              to={`/society-admin/${societyId}/events/${event._id}`}
              className="event-list-item"
              key={event._id}
            >
              <div>
                <small>{event.eventCode}</small>
                <h3>{event.title || "Untitled event"}</h3>
                <span>
                  {event.startDate
                    ? new Date(event.startDate).toLocaleDateString()
                    : "Dates not set"}
                </span>
              </div>
              <StatusChip status={event.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
