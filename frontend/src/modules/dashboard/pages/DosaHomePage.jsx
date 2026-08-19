import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CircleCheck, CircleX, ClipboardList } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import DashboardStatCard from "../components/DashboardStatCard";
import LoadingState from "../../../components/common/LoadingState";
import EmptyState from "../../../components/common/EmptyState";
import AppButton from "../../../components/common/AppButton";
import { StatusChip } from "../../../design-system";
import {
  eventReviewCounts,
  listAssignedEventReviews,
} from "../../events/services/eventApi";
const fmt = (value) => (value ? new Date(value).toLocaleDateString() : "—");
export default function DosaHomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [counts, pending] = await Promise.all([
        eventReviewCounts(),
        listAssignedEventReviews({ status: "PENDING" }),
      ]);
      const pendingCount = counts.PENDING || 0;
      const approvedCount = counts.APPROVED || 0;
      const rejectedCount = counts.REJECTED || 0;
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      setData({
        pendingCount,
        approvedCount,
        rejectedCount,
        total,
        recent: pending.items?.slice(0, 5) || [],
      });
    } catch (e) {
      setError(e.readableMessage);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (loading) return <LoadingState />;
  if (error)
    return (
      <EmptyState
        title="Dashboard unavailable"
        message={error}
        actionLabel="Retry"
        onAction={load}
      />
    );
  return (
    <div className="page-stack">
      <section className="dashboard-hero cc-hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Good evening,</p>
          <h2>DoSA</h2>
          <p>Final approval authority for society event proposals reaching your queue.</p>
          <AppButton
            className="hero-action"
            variant="outlinePrimary"
            onClick={() => navigate("/dosa/events")}
          >
            Review events
          </AppButton>
        </div>
        <div className="hero-stats" aria-label="DoSA highlights">
          <div className="hero-stat">
            <ClipboardList size={20} />
            <strong>{data.pendingCount}</strong>
            <span>Pending with you</span>
          </div>
          <div className="hero-stat">
            <CircleCheck size={20} />
            <strong>{data.approvedCount}</strong>
            <span>Approved</span>
          </div>
          <div className="hero-stat">
            <CircleX size={20} />
            <strong>{data.rejectedCount}</strong>
            <span>Rejected</span>
          </div>
        </div>
      </section>
      <section>
        <div className="section-title">
          <h3>Approval overview</h3>
        </div>
        <div className="stats-grid">
          <DashboardStatCard
            icon={ClipboardList}
            label="Pending with DoSA"
            value={data.pendingCount}
            tone="lavender"
          />
          <DashboardStatCard
            icon={CircleCheck}
            label="Approved"
            value={data.approvedCount}
            tone="mint"
          />
          <DashboardStatCard
            icon={CircleX}
            label="Rejected"
            value={data.rejectedCount}
            tone="peach"
          />
          <DashboardStatCard
            icon={CalendarCheck}
            label="Total Reviewed by You"
            value={data.total}
            tone="lime"
          />
        </div>
      </section>
      <section>
        <div className="section-title">
          <h3>Pending your approval</h3>
          <Link className="muted" to="/dosa/events">
            View all
          </Link>
        </div>
        {data.recent.length ? (
          <div className="event-list">
            {data.recent.map((review) => {
              const event = review.eventId;
              return (
                <Link
                  className="event-list-item"
                  to={`/dosa/events/${event._id}`}
                  key={review._id}
                >
                  <div>
                    <small>{event.eventCode}</small>
                    <h3>{event.title || "Untitled Event"}</h3>
                    <span>
                      {event.societyId?.name} · {fmt(event.startDate)} —{" "}
                      {fmt(event.endDate)}
                    </span>
                  </div>
                  <StatusChip status={event.status} />
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No events pending"
            message="Nothing is currently waiting on your final approval."
          />
        )}
      </section>
    </div>
  );
}
