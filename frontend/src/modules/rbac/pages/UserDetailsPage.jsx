/* eslint-disable react-hooks/rules-of-hooks */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, ShieldCheck } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  StatusChip,
  Switch,
} from "../../../design-system";
import {
  changeLoginAccess,
  changeUserStatus,
  finishAssignment,
  getUser,
  getUserEffectivePermissions,
  listAssignments,
} from "../services/rbacApi";
import AssignRoleModal from "../components/AssignRoleModal";
import EditUserModal from "../components/EditUserModal";
import EditAssignmentModal from "../components/EditAssignmentModal";
import { useCapability } from "../hooks/useCapability";
const value = (v) => v || "—",
  date = (v) => (v ? new Date(v).toLocaleDateString() : "—");
export default function UserDetailsPage() {
  const { id } = useParams(),
    userId = id || useParams().userId,
    nav = useNavigate(),
    can = useCapability(),
    [user, setUser] = useState(null),
    [assignments, setAssignments] = useState([]),
    [effective, setEffective] = useState({ roles: [], permissions: [] }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [assign, setAssign] = useState(false),
    [editing, setEditing] = useState(false),
    [assignmentEdit, setAssignmentEdit] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [u, a, e] = await Promise.all([
        getUser(userId),
        listAssignments({ userId, limit: 100 }),
        getUserEffectivePermissions(userId),
      ]);
      setUser(u);
      setAssignments(a.items);
      setEffective(e);
    } catch (e) {
      setError(e.readableMessage);
    } finally {
      setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);
  if (loading) return <Skeleton lines={9} />;
  if (error || !user)
    return (
      <EmptyState
        title="User unavailable"
        description={error}
        action={<Button onClick={load}>Retry</Button>}
      />
    );
  const updateLogin = async (checked) => {
      if(!window.confirm(`${checked?'Enable':'Disable'} login access for ${user.displayName}?`))return;
      await changeLoginAccess(userId, checked);
      load();
    },
    updateStatus = async () => {
      if(!window.confirm(`${user.status==='ACTIVE'?'Deactivate':'Activate'} ${user.displayName}?`))return;
      await changeUserStatus(
        userId,
        user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
      );
      load();
    };
  return (
    <div className="page-stack rbac-page">
      <Button
        variant="ghost"
        icon={ArrowLeft}
        onClick={() => nav("/admin/users")}
      >
        Back to users
      </Button>
      <PageHeader
        title={user.displayName}
        description={user.email}
        actions={
          <div className="rbac-actions">{can("user.edit")&&<Button variant="outline" onClick={()=>setEditing(true)}>Edit User</Button>}{can("user_role_assignment.create")&&<Button icon={Plus} onClick={() => setAssign(true)}>Add Role</Button>}</div>
        }
      />
      <div className="rbac-detail-grid">
        <Card title="Identity">
          <dl>
            <dt>Name</dt>
            <dd>{user.displayName}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Account type</dt>
            <dd>{user.accountType}</dd>
            <dt>Contact</dt>
            <dd>{value(user.metadata?.contactNumber)}</dd>
          </dl>
        </Card>
        <Card title="Organization">
          <dl>
            <dt>Department</dt>
            <dd>{value(user.metadata?.department)}</dd>
            <dt>Designation</dt>
            <dd>{value(user.metadata?.designation)}</dd>
          </dl>
        </Card>
        <Card
          title="Portal Access"
          actions={
            can("user.status.change") && (
              <Button variant="outline" onClick={updateStatus}>
                {user.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </Button>
            )
          }
        >
          <dl>
            <dt>Status</dt>
            <dd>
              <StatusChip status={user.status} />
            </dd>
            <dt>Login allowed</dt>
            <dd>
              {can("user.login_access.change") ? (
                <Switch
                  checked={user.isLoginAllowed}
                  onChange={(e) => updateLogin(e.target.checked)}
                  label={user.isLoginAllowed ? "Allowed" : "Disabled"}
                />
              ) : user.isLoginAllowed ? (
                "Allowed"
              ) : (
                "Disabled"
              )}
            </dd>
          </dl>
        </Card>
        <Card title="Security">
          <p>
            Active session counts and session revocation are not exposed by the
            current backend API.
          </p>
        </Card>
      </div>
      <Card
        title="Role Assignments"
        description="Current assignments and complete assignment history."
      >
        {assignments.length ? (
          <div className="rbac-assignment-list">
            {assignments.map((a) => {
              const active = a.status === "ACTIVE" && a.isOngoing,
                newDate = new Date(),
                inWindow =
                  (!a.validFrom || new Date(a.validFrom) <= newDate) &&
                  (!a.validUntil || new Date(a.validUntil) >= newDate),
                ready = Boolean(
                  user.status === "ACTIVE" &&
                    user.isLoginAllowed &&
                    active &&
                    inWindow &&
                    a.scopeType === "SOCIETY" &&
                    a.roleId?.isLeadershipRole
                );
              return (
                <article key={a._id}>
                  <div>
                    <h4>
                      {a.roleId?.name || "Unknown role"}{" "}
                      <Badge tone={active ? "success" : "neutral"}>
                        {a.status}
                      </Badge>
                    </h4>
                    <p>
                      {a.scopeType}
                      {a.societyId?.name ? ` · ${a.societyId.name}` : ""}
                      {a.academicSession ? ` · ${a.academicSession}` : ""}
                    </p>
                    <small>
                      {date(a.validFrom)} —{" "}
                      {a.isOngoing ? "Ongoing" : date(a.validUntil)}
                    </small>
                    {a.scopeType === "SOCIETY" && (
                      <p className={ready ? "rbac-ready" : "rbac-not-ready"}>
                        <ShieldCheck size={15} />
                        {ready
                          ? "Verification Ready"
                          : "Not Eligible for Verification"}
                      </p>
                    )}
                  </div>
                  {a.roleId?.code === "SUPER_ADMIN" && <Badge>Protected System Role</Badge>}
                  {active && a.roleId?.code !== "SUPER_ADMIN" && can("user_role_assignment.end") && (
                    <div>
                      {can("user_role_assignment.edit")&&<Button variant="ghost" onClick={()=>setAssignmentEdit(a)}>Edit</Button>}
                      <Button
                        variant="outline"
                        onClick={async () => {
                          await finishAssignment(a._id, "end");
                          load();
                        }}
                      >
                        End
                      </Button>
                      <Button
                        variant="danger"
                        onClick={async () => {
                          await finishAssignment(a._id, "revoke");
                          load();
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No role assignments"
            description="Assign a global or society-scoped role to this user."
          />
        )}
      </Card>
      <Card title="Effective Permissions" description="Resolved through active roles; authorization retains each assignment's scope.">
        <div className="permission-effective-summary">{effective.roles.map((role, index) => <Badge key={`${role.code}-${index}`} tone="info">{role.code} · {role.scopeType}</Badge>)}</div>
        {effective.permissions.length ? <div className="permission-effective-list">{effective.permissions.map((permission) => <article key={permission.code}><code>{permission.code}</code><span>{permission.displayName}</span><small>{permission.dataScope} scope · {permission.sourceRoleCodes.join(", ")}</small></article>)}</div> : <EmptyState title="No effective permissions" description="This user has no permissions through active global roles." />}
      </Card>
      <AssignRoleModal
        open={assign}
        user={user}
        onClose={() => setAssign(false)}
        onAssigned={() => {
          setAssign(false);
          load();
        }}
      />
      <EditUserModal user={editing?user:null} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);load()}} />
      <EditAssignmentModal assignment={assignmentEdit} onClose={()=>setAssignmentEdit(null)} onSaved={()=>{setAssignmentEdit(null);load()}} />
    </div>
  );
}
