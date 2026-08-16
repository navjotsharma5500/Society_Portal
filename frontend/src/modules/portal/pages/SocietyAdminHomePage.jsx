import { CalendarDays, ClipboardCheck, UsersRound } from "lucide-react";
import { StatCard } from "../../../design-system";
import { useEffect, useState } from "react";
import { claimCounts, joinCounts } from "../../approvals/services/approvalApi";
import { useAuth } from "../../auth/hooks/useAuth";
import { countActiveMembers } from "../services/membershipApi";
export default function SocietyAdminHomePage() {
  const { user, activeDashboardContext: c } = useAuth();
  const [pending, setPending] = useState("—"),
    [members, setMembers] = useState("—");
  useEffect(() => {
    if (!c?.societyId) return;
    Promise.all([
      claimCounts(c.societyId),
      joinCounts(c.societyId),
      countActiveMembers(c.societyId),
    ])
      .then(([a, b, m]) => {
        setPending((a.PENDING || 0) + (b.PENDING || 0));
        setMembers(m);
      })
      .catch(() => {
        setPending("—");
        setMembers("—");
      });
  }, [c?.societyId]);
  return (
    <div className="page-stack">
      <section className="dashboard-hero cc-hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Good evening,</p>
          <h2>{user?.displayName}</h2>
          <p>Manage {c?.societyName} activities and approvals.</p>
        </div>
      </section>
      <div className="society-stat-grid">
        <StatCard
          icon={ClipboardCheck}
          label="Pending Approvals"
          value={pending}
        />
        <StatCard icon={UsersRound} label="Active Members" value={members} />
        <StatCard icon={CalendarDays} label="Upcoming Events" value="—" />
      </div>
    </div>
  );
}
