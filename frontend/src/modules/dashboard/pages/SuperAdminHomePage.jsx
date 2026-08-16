import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Building2,
  CircleCheck,
  CircleOff,
  Download,
  GraduationCap,
  Upload,
  UsersRound,
  UserCog,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import AppButton from "../../../components/common/AppButton";
import DashboardStatCard from "../components/DashboardStatCard";
import SocietyCard from "../../societies/components/SocietyCard";
import ImportSocietiesModal from "../../societies/components/ImportSocietiesModal";
import LoadingState from "../../../components/common/LoadingState";
import EmptyState from "../../../components/common/EmptyState";
import { getSuperAdminSummary } from "../services/dashboardApi";
import { downloadTemplate } from "../../../services/societyImportApi";
import { useToast } from "../../../components/common/toastContext";
import {
  notifySocietiesUpdated,
  subscribeToSocietyUpdates,
} from "../../../utils/societyEvents";
export default function SuperAdminHomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const { notify } = useToast();
  const navigate = useNavigate();
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const summary = await getSuperAdminSummary();
      setData({
        total: summary.societyCount,
        active: summary.activeSocietyCount,
        inactive: summary.inactiveSocietyCount,
        leadership: summary.leadershipCount,
        recent: summary.recentSocieties,
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
  useEffect(() => subscribeToSocietyUpdates(load), [load]);
  const download = async () => {
    try {
      await downloadTemplate();
      notify("Template downloaded", "success");
    } catch (e) {
      notify(e.readableMessage, "error");
    }
  };
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
          <h2>Super Admin</h2>
          <p>Manage societies, leadership and portal configuration from one connected workspace.</p>
          <AppButton className="hero-action" variant="outlinePrimary" onClick={() => navigate("/admin/societies")}>Manage societies</AppButton>
        </div>
        <div className="hero-stats" aria-label="Portal highlights">
          <div className="hero-stat"><Building2 size={20}/><strong>{data.total}</strong><span>Societies</span></div>
          <div className="hero-stat"><UsersRound size={20}/><strong>{data.leadership}</strong><span>Leadership</span></div>
          <div className="hero-stat"><CircleOff size={20}/><strong>{data.inactive}</strong><span>Pending review</span></div>
        </div>
      </section>
      <section>
        <div className="section-title">
          <h3>Portal overview</h3>
        </div>
        <div className="stats-grid">
          <DashboardStatCard
            icon={Building2}
            label="Total Societies"
            value={data.total}
            tone="lavender"
          />
          <DashboardStatCard
            icon={CircleCheck}
            label="Active Societies"
            value={data.active}
            tone="mint"
          />
          <DashboardStatCard
            icon={CircleOff}
            label="Inactive Societies"
            value={data.inactive}
            tone="peach"
          />
          <DashboardStatCard
            icon={UsersRound}
            label="Leadership Assignments"
            value={data.leadership}
            tone="lime"
          />
        </div>
      </section>
      <section>
        <div className="section-title">
          <h3>Quick actions</h3>
        </div>
        <div className="quick-grid">
          <button className="button button-ghost quick-action" onClick={() => navigate("/admin/users")}>
            <UserCog />
            Manage Users
          </button>
          <button className="button button-ghost quick-action" onClick={() => navigate("/admin/roles")}>
            <ShieldCheck />
            Roles &amp; Permissions
          </button>
          <button className="button button-ghost quick-action" onClick={() => navigate("/admin/students")}>
            <GraduationCap />
            Manage Students
          </button>
          <button
            className="button button-ghost quick-action"
            onClick={() => navigate("/admin/societies")}
          >
            <Building2 />
            Manage Societies
          </button>
          <button
            className="button button-ghost quick-action"
            onClick={() => setImportOpen(true)}
          >
            <Upload />
            Upload Society Excel
          </button>
          <button
            className="button button-ghost quick-action"
            onClick={download}
          >
            <Download />
            Download Template
          </button>
          <button
            className="button button-ghost quick-action"
            onClick={() => notify("Notifications are coming soon", "info")}
          >
            <Bell />
            View Notifications
          </button>
        </div>
      </section>
      <section>
        <div className="section-title">
          <h3>Recent societies</h3>
          <Link className="muted" to="/admin/societies">
            View all
          </Link>
        </div>
        {data.recent.length ? (
          <div className="society-list">
            {data.recent.map((s) => (
              <SocietyCard
                key={s._id}
                society={s}
                onEdit={() => navigate("/admin/societies")}
                onStatus={() => navigate("/admin/societies")}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No societies yet"
            message="Create or import the first Society."
          />
        )}
      </section>
      <ImportSocietiesModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImportCompleted={notifySocietiesUpdated}
      />
    </div>
  );
}
