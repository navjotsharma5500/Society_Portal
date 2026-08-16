import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, RefreshCw, XCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  PageHeader,
  Pagination,
  SearchBox,
  Select,
  Skeleton,
  StatusChip,
} from "../../../design-system";
import { useToast } from "../../../components/common/toastContext";
import {
  claimCounts,
  decideClaim,
  decideJoin,
  getClaimApproval,
  getJoinApproval,
  joinCounts,
  listClaimApprovals,
  listJoinApprovals,
} from "../services/approvalApi";
import DecisionDialog from "../components/DecisionDialog";
import { listRoles } from "../../rbac/services/rbacApi";
import { decideEventReview, listAssignedEventReviews } from "../../events/services/eventApi";
import "../approvals.css";
const tabs = [
    "Pending",
    "Existing Society Verification",
    "Join Society Requests",
    "Completed",
    "Rejected",
  ],
  fmt = (v) => (v ? new Date(v).toLocaleDateString() : "—");
export default function ApprovalCenterPage() {
  const { societyId } = useParams(),
    { notify } = useToast(),
    [tab, setTab] = useState("Pending"),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [role, setRole] = useState(""),
    [session, setSession] = useState(""),
    [submittedFrom, setSubmittedFrom] = useState(""),
    [submittedTo, setSubmittedTo] = useState(""),
    [roleOptions, setRoleOptions] = useState([]),
    [items, setItems] = useState([]),
    [counts, setCounts] = useState({}),
    [pagination, setPagination] = useState({ totalPages: 1 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [detail, setDetail] = useState(null),
    [decision, setDecision] = useState(null),
    [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const status =
          tab === "Rejected"
            ? "REJECTED"
            : tab === "Completed"
            ? "APPROVED"
            : "PENDING",
        params = {
          page,
          limit: 10,
          status,
          ...(societyId ? { societyId } : {}),
          ...(role ? { roleId: role } : {}),
          ...(session ? { academicSession: session } : {}),
          ...(submittedFrom ? { submittedFrom } : {}),
          ...(submittedTo ? { submittedTo } : {}),
        },
        wantClaims = tab !== "Join Society Requests",
        wantJoins = tab !== "Existing Society Verification";
      const [c, j, cc, jc, er] = await Promise.all([
        wantClaims
          ? listClaimApprovals(params)
          : Promise.resolve({ items: [], pagination: { totalPages: 1 } }),
        wantJoins
          ? listJoinApprovals(params)
          : Promise.resolve({ items: [], pagination: { totalPages: 1 } }),
        claimCounts(societyId, {
          roleId: role,
          academicSession: session,
          submittedFrom,
          submittedTo,
        }),
        joinCounts(societyId, {
          roleId: role,
          academicSession: session,
          submittedFrom,
          submittedTo,
        }),
        listAssignedEventReviews({ page, limit: 10, status }),
      ]);
      const claims = c.items.map((x) => ({ ...x, approvalType: "CLAIM" })),
        joins = j.items.map((x) => ({ ...x, approvalType: "JOIN" })),
        eventReviews = (er.items || []).map((x) => ({ ...x, approvalType: "EVENT" })),
        combined = [...claims, ...joins, ...eventReviews].sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );
      setItems(combined);
      setPagination({
        totalPages: Math.max(
          c.pagination?.totalPages || 1,
          j.pagination?.totalPages || 1
          ,er.pagination?.totalPages || 1
        ),
      });
      setCounts({
        pending: (cc.PENDING || 0) + (jc.PENDING || 0) + (status === "PENDING" ? er.pagination?.totalItems || eventReviews.length : 0),
        claims: cc.PENDING || 0,
        joins: jc.PENDING || 0,
        completed: (cc.APPROVED || 0) + (jc.APPROVED || 0),
        rejected: (cc.REJECTED || 0) + (jc.REJECTED || 0),
      });
    } catch (e) {
      setError(e.readableMessage);
    } finally {
      setLoading(false);
    }
  }, [tab, page, societyId, role, session, submittedFrom, submittedTo]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    listRoles({ status: "ACTIVE", limit: 100 })
      .then((x) => setRoleOptions(x.items))
      .catch(() => {});
  }, []);
  const shown = useMemo(
    () =>
      items.filter((x) => {
        const student = x.studentMasterId || {},
          event = x.eventId || {},
          q = search.toLowerCase();
        return (
          !q ||
          [
            student.name,
            student.rollNumber,
            student.email,
            event.title,
            event.eventCode,
          ].some((v) =>
            String(v || "")
              .toLowerCase()
              .includes(q)
          )
        );
      }),
    [items, search]
  );
  const open = async (item) => {
    try {
      setDetail(
        item.approvalType === "EVENT"
          ? { eventReview: item }
          : item.approvalType === "CLAIM"
          ? await getClaimApproval(item._id)
          : { request: await getJoinApproval(item._id) }
      );
    } catch (e) {
      notify(e.readableMessage, "error");
    }
  };
  const act = (item, action) => {
    const claim = item.approvalType === "CLAIM",
      isEvent = item.approvalType === "EVENT",
      map = isEvent
        ? {
            approve: ["Forward this event?", "Approve / Forward"],
            reject: ["Reject this event?", "Reject"],
            "request-changes": ["Request event changes", "Request Changes"],
          }
        : claim
        ? {
            approve: ["Approve society participation?", "Approve"],
            reject: ["Reject society participation?", "Reject"],
            "request-changes": ["Request correction", "Request Correction"],
          }
        : {
            approve: ["Approve join request?", "Approve"],
            reject: ["Reject join request?", "Reject"],
            "request-clarification": [
              "Request clarification",
              "Request Clarification",
            ],
          };
    setDecision({ item, action, title: map[action][0], label: map[action][1] });
  };
  const confirm = async (payload) => {
    setSaving(true);
    try {
      if (decision.item.approvalType === "EVENT")
        await decideEventReview(
          decision.item._id,
          decision.action === "approve"
            ? "APPROVE"
            : decision.action === "reject"
            ? "REJECT"
            : "REQUEST_CHANGES",
          payload.reason || payload.remarks
        );
      else if (decision.item.approvalType === "CLAIM")
        await decideClaim(decision.item._id, decision.action, payload);
      else await decideJoin(decision.item._id, decision.action, payload);
      notify("Decision saved.", "success");
      setDecision(null);
      setDetail(null);
      load();
    } catch (e) {
      notify(
        e.errorCode?.includes("ALREADY")
          ? "This request has already been reviewed."
          : e.readableMessage,
        "error"
      );
      setDecision(null);
      load();
    } finally {
      setSaving(false);
    }
  };
  const badge = [
    counts.pending,
    counts.claims,
    counts.joins,
    counts.completed,
    counts.rejected,
  ];
  return (
    <div className="page-stack approval-center">
      <PageHeader
        title="Approval Center"
        description="Review society verification and join requests assigned to your workspace."
        actions={
          <Button variant="ghost" icon={RefreshCw} onClick={load}>
            Refresh
          </Button>
        }
      />
      <nav className="approval-tabs">
        {tabs.map((x, i) => (
          <button
            className={tab === x ? "active" : ""}
            key={x}
            onClick={() => {
              setTab(x);
              setPage(1);
            }}
          >
            {x}
            <Badge>{badge[i] || 0}</Badge>
          </button>
        ))}
      </nav>
      <div className="approval-filters">
        <SearchBox
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student…"
        />
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={[
            { value: "", label: "All roles" },
            ...roleOptions.map((x) => ({ value: x._id, label: x.name })),
          ]}
        />
        <input
          className="ds-control"
          aria-label="Academic session"
          placeholder="Academic session"
          value={session}
          onChange={(e) => setSession(e.target.value)}
        />
        <input
          className="ds-control"
          type="date"
          aria-label="Submitted from"
          value={submittedFrom}
          onChange={(e) => setSubmittedFrom(e.target.value)}
        />
        <input
          className="ds-control"
          type="date"
          aria-label="Submitted to"
          value={submittedTo}
          onChange={(e) => setSubmittedTo(e.target.value)}
        />
      </div>
      {loading ? (
        <Skeleton lines={8} />
      ) : error ? (
        <EmptyState
          title="Approvals unavailable"
          description={error}
          action={<Button onClick={load}>Retry</Button>}
        />
      ) : !shown.length ? (
        <EmptyState
          title="No approvals found"
          description="There are no requests in this queue."
        />
      ) : (
        <>
          <div className="desktop-only approval-table">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Type</th>
                  <th>Society / Role</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => {
                  const eventApproval = x.approvalType === "EVENT",
                    s = eventApproval
                      ? {
                          name: x.eventId?.title,
                          rollNumber: x.eventId?.eventCode,
                        }
                      : x.studentMasterId || {},
                    claim = x.approvalType === "CLAIM";
                  return (
                    <tr key={`${x.approvalType}-${x._id}`}>
                      <td>
                        <b>{s.name || "Student"}</b>
                        <small>{s.rollNumber || s.email}</small>
                      </td>
                      <td>
                        {eventApproval
                          ? "Event Approval"
                          : claim
                          ? "Existing Verification"
                          : "Join Request"}
                      </td>
                      <td>
                        {
                          (eventApproval ? x.eventId?.societyId : x.societyId)
                            ?.name
                        }
                        <small>
                          {eventApproval
                            ? x.assignedRoleCode
                            : claim
                            ? x.claimedRoleId?.name
                            : "Member"}
                        </small>
                      </td>
                      <td>{fmt(x.updatedAt)}</td>
                      <td>
                        <StatusChip status={x.status} />
                      </td>
                      <td>
                        <div className="approval-actions">
                          <Button
                            variant="ghost"
                            icon={Eye}
                            onClick={() => open(x)}
                          >
                            Details
                          </Button>
                          {x.status === "PENDING" && (
                            <>
                              <Button
                                variant="success"
                                icon={CheckCircle2}
                                onClick={() => act(x, "approve")}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="danger"
                                icon={XCircle}
                                onClick={() => act(x, "reject")}
                              >
                                Reject
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  act(
                                    x,
                                    claim || eventApproval
                                      ? "request-changes"
                                      : "request-clarification"
                                  )
                                }
                              >
                                {eventApproval
                                  ? "Changes"
                                  : claim
                                  ? "Correction"
                                  : "Clarify"}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mobile-only approval-cards">
            {shown.map((x) => (
              <article className="ds-card" key={`${x.approvalType}-${x._id}`}>
                <header>
                  <b>{x.studentMasterId?.name || "Student"}</b>
                  <StatusChip status={x.status} />
                </header>
                <p>
                  {x.societyId?.name} ·{" "}
                  {x.approvalType === "CLAIM"
                    ? x.claimedRoleId?.name
                    : "Member"}
                </p>
                <Button variant="outline" onClick={() => open(x)}>
                  View Details
                </Button>
              </article>
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={pagination.totalPages}
            onChange={setPage}
          />
        </>
      )}
      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Approval Details"
      >
        {detail && <ApprovalDetail data={detail} onAct={act} />}
      </Drawer>
      <DecisionDialog
        decision={decision}
        onClose={() => setDecision(null)}
        onConfirm={confirm}
        loading={saving}
      />
    </div>
  );
}
function ApprovalDetail({ data }) {
  if (data.eventReview) {
    const r = data.eventReview,
      e = r.eventId;
    return (
      <div className="approval-detail">
        <h3>{e.title || "Untitled event"}</h3>
        <p>
          {e.eventCode} · {e.societyId?.name}
        </p>
        <Link className="button button-primary" to={`/event-reviews/${e._id}`}>
          Open Full Event
        </Link>
        <dl>
          <dt>Stage</dt>
          <dd>{r.stage.replaceAll("_", " ")}</dd>
          <dt>Status</dt>
          <dd>{r.status}</dd>
          <dt>Attempt</dt>
          <dd>{r.attempt}</dd>
          <dt>Submitted</dt>
          <dd>{fmt(e.submittedAt)}</dd>
        </dl>
        <p>
          Use the queue actions to forward, request changes, or reject this
          proposal.
        </p>
      </div>
    );
  }
  const x = data.claim || data.request,
    s = x.studentMasterId || {},
    claim = Boolean(data.claim);
  return (
    <div className="approval-detail">
      <h3>{s.name}</h3>
      <p>
        {s.rollNumber} · {s.email}
      </p>
      <dl>
        <dt>Society</dt>
        <dd>{x.societyId?.name}</dd>
        <dt>Role</dt>
        <dd>{claim ? x.claimedRoleId?.name : "Member"}</dd>
        <dt>Course</dt>
        <dd>
          {[s.course, s.branch, s.year].filter(Boolean).join(" · ") || "—"}
        </dd>
        <dt>Duration</dt>
        <dd>
          {claim
            ? `${fmt(x.startDate)} — ${
                x.isOngoing ? "Present" : fmt(x.endDate)
              }`
            : "—"}
        </dd>
        <dt>Academic session</dt>
        <dd>{x.academicSession || "—"}</dd>
        <dt>Attempt</dt>
        <dd>{x.attemptNumber}</dd>
        <dt>Status</dt>
        <dd>{x.status}</dd>
      </dl>
      {claim && (
        <section>
          <h4>Events ({x.events?.length || 0})</h4>
          {x.events?.map((e) => (
            <details key={e._id}>
              <summary>{e.eventName}</summary>
              <p>
                {fmt(e.startDate)} — {fmt(e.endDate)}
              </p>
              <p>{e.description}</p>
            </details>
          ))}
        </section>
      )}
      {!claim && (
        <section>
          <h4>Student interest</h4>
          <p>{x.requestReason || x.studentMessage || "—"}</p>
        </section>
      )}
      {data.decisions?.length > 0 && (
        <section>
          <h4>Previous decisions</h4>
          {data.decisions.map((d) => (
            <p key={d._id}>
              {d.decision} · {fmt(d.decisionAt)} {d.reason && `— ${d.reason}`}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
