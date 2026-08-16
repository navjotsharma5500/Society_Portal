import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, RefreshCw, Upload } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  EmptyState,
  PageHeader,
  SearchBox,
  Select,
  Skeleton,
  StatusChip,
} from "../../../design-system";
import {
  exportUserRows,
  downloadUserTemplate,
  previewUserImport,
  confirmUserImport,
  listRoles,
  listUsers,
} from "../services/rbacApi";
import AddUserModal from "../components/AddUserModal";
import AssignRoleModal from "../components/AssignRoleModal";
import EditUserModal from "../components/EditUserModal";
import { useCapability } from "../hooks/useCapability";
import ExistingRecordsUpdate from "../../students/components/ExistingRecordsUpdate";
import { useToast } from "../../../components/common/toastContext";
import "../rbac.css";
export default function UserManagementPage() {
  const { notify } = useToast();
  const importInput=useRef(null);
  const nav = useNavigate(),
    [params] = useSearchParams(),
    can = useCapability(),
    [users, setUsers] = useState([]),
    [roles, setRoles] = useState([]),
    [assignments, setAssignments] = useState({}),
    [filters, setFilters] = useState({
      search: "",
      accountType: "",
      status: "",
      login: "",
      role: params.get("role") || "",
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [add, setAdd] = useState(false),
    [editing, setEditing] = useState(null),
    [assign, setAssign] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [u, r] = await Promise.all([
        listUsers({ limit: 100 }),
        listRoles({ limit: 100 }),
      ]);
      const managedUsers = u.items;
      setUsers(managedUsers);
      setRoles(r.items);
      setAssignments(Object.fromEntries(managedUsers.map((x) => [x._id, x.activeAssignments || []])));
    } catch (e) {
      setError(e.readableMessage);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const shown = useMemo(
    () =>
      users.filter((u) => {
        const q = filters.search.toLowerCase(),
          meta = u.metadata || {},
          matches =
            !q ||
            [u.displayName, u.email, meta.department, meta.designation].some(
              (v) =>
                String(v || "")
                  .toLowerCase()
                  .includes(q)
            );
        return (
          matches &&
          (!filters.accountType || u.accountType === filters.accountType) &&
          (!filters.status || u.status === filters.status) &&
          (!filters.login || String(u.isLoginAllowed) === filters.login) &&
          (!filters.role ||
            (assignments[u._id] || []).some(
              (a) => (a.roleId?._id || a.roleId) === filters.role
            ))
        );
      }),
    [users, filters, assignments]
  );
  const set = (k, v) => setFilters((x) => ({ ...x, [k]: v }));
  const downloadTemplate=async()=>{try{const blob=await downloadUserTemplate(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='TIET-Staff-User-Import-Template.xlsx';a.click();URL.revokeObjectURL(url)}catch(error){notify(error.readableMessage||'Template download failed.','error')}};
  const importUsers=async(event)=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const preview=await previewUserImport(file),count=preview.summary?.validRows||0;if(!count)return notify('No valid rows were found in the workbook.','warning');if(!window.confirm(`Import ${count} validated staff users?`))return;const result=await confirmUserImport(preview.importSessionId);notify(`${result.summary?.created||0} users imported.`,'success');load()}catch(error){notify(error.readableMessage||'User import failed.','error')}};
  return (
    <div className="page-stack rbac-page">
      <PageHeader
        title="User Management"
        description="Manage faculty, staff, administrators and portal access."
        actions={
          <div className="rbac-actions">
            <input ref={importInput} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importUsers}/>
            {can("user.create")&&<Button variant="outline" icon={Download} onClick={downloadTemplate}>Download Template</Button>}
            {can("user.create")&&<Button variant="outline" icon={Upload} onClick={()=>importInput.current?.click()}>Upload Excel</Button>}
            <ExistingRecordsUpdate type="user" onCompleted={load} notify={notify} />
            {can("user.create") && (
              <Button icon={Plus} onClick={() => setAdd(true)}>
                Add User
              </Button>
            )}
            <Button
              variant="outline"
              icon={Download}
              onClick={() => exportUserRows(shown)}
            >
              Export Users
            </Button>
            <Button variant="ghost" icon={RefreshCw} onClick={load}>
              Refresh
            </Button>
          </div>
        }
      />
      <div className="rbac-filters">
        <SearchBox
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          placeholder="Search name, email, department…"
        />
        <Select
          label="Account Type"
          value={filters.accountType}
          onChange={(e) => set("accountType", e.target.value)}
          options={[
            { value: "", label: "All types" },
            ...["FACULTY", "STAFF", "ADMIN", "SUPER_ADMIN", "SECURITY"].map(
              (value) => ({ value, label: value.replaceAll("_", " ") })
            ),
          ]}
        />
        <Select
          label="Status"
          value={filters.status}
          onChange={(e) => set("status", e.target.value)}
          options={[
            { value: "", label: "All statuses" },
            ...[
              "ACTIVE",
              "INACTIVE",
              "SUSPENDED",
              "PENDING_ONBOARDING",
              "PENDING_APPROVAL",
            ],
          ]}
        />
        <Select
          label="Login"
          value={filters.login}
          onChange={(e) => set("login", e.target.value)}
          options={[
            { value: "", label: "Any access" },
            { value: "true", label: "Allowed" },
            { value: "false", label: "Disabled" },
          ]}
        />
        <Select
          label="Role"
          value={filters.role}
          onChange={(e) => set("role", e.target.value)}
          options={[
            { value: "", label: "All roles" },
            ...roles.map((r) => ({ value: r._id, label: r.name })),
          ]}
        />
      </div>
      {loading ? (
        <Skeleton lines={8} />
      ) : error ? (
        <EmptyState
          title="Users unavailable"
          description={error}
          action={<Button onClick={load}>Retry</Button>}
        />
      ) : !shown.length ? (
        <EmptyState
          title="No users found"
          description="Change the filters or add a portal user."
        />
      ) : (
        <>
          <div className="desktop-only rbac-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Account Type</th>
                  <th>Department / Designation</th>
                  <th>Contact</th>
                  <th>Login Access</th>
                  <th>Account Status</th>
                  <th>Assigned Roles</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <span className="rbac-user">
                        <Avatar
                          name={u.displayName}
                          src={u.profilePictureUrl}
                        />
                        <span>
                          <b>{u.displayName}</b>
                          <small>{u.email}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <Badge>{u.accountType.replaceAll("_", " ")}</Badge>
                    </td>
                    <td>
                      {u.displayDepartment || "—"}
                      <small className="rbac-block">
                        {u.displayDesignation || "—"}
                      </small>
                    </td>
                    <td>{u.displayContact || "—"}</td>
                    <td>
                      <Badge tone={u.isLoginAllowed ? "success" : "danger"}>
                        {u.isLoginAllowed ? "Allowed" : "Disabled"}
                      </Badge>
                    </td>
                    <td>
                      <StatusChip status={u.status} />
                    </td>
                    <td>
                      <div className="rbac-chips">
                        {(assignments[u._id] || []).slice(0, 3).map((a) => (
                          <Badge key={a._id} tone="info">
                            {a.roleId?.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Dropdown
                        items={[
                          {
                            label: "View Details",
                            onClick: () => nav(`/admin/users/${u._id}`),
                          },
                          ...(can("user.edit")
                            ? [
                                {
                                  label: "Edit User",
                                  onClick: () => setEditing(u),
                                },
                              ]
                            : []),
                          ...(can("user_role_assignment.create")
                            ? [
                                {
                                  label: "Manage Roles",
                                  onClick: () => nav(`/admin/users/${u._id}`),
                                },
                              ]
                            : []),
                          ...(can("user.login_access.change")
                            ? [
                                {
                                  label: "Login Access",
                                  onClick: () => nav(`/admin/users/${u._id}`),
                                },
                              ]
                            : []),
                          ...(can("user.status.change")
                            ? [
                                {
                                  label: "Account Status",
                                  onClick: () => nav(`/admin/users/${u._id}`),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-only rbac-card-list">
            {shown.map((u) => (
              <article className="ds-card" key={u._id}>
                <header>
                  <span className="rbac-user">
                    <Avatar name={u.displayName} src={u.profilePictureUrl} />
                    <span>
                      <b>{u.displayName}</b>
                      <small>{u.email}</small>
                    </span>
                  </span>
                  <StatusChip status={u.status} />
                </header>
                <p>
                  {u.accountType.replaceAll("_", " ")} ·{" "}
                  {u.displayDepartment || "—"} · {u.displayContact || "—"}
                </p>
                <Dropdown
                  items={[
                    {
                      label: "View Details",
                      onClick: () => nav(`/admin/users/${u._id}`),
                    },
                    ...(can("user.edit")
                      ? [{ label: "Edit User", onClick: () => setEditing(u) }]
                      : []),
                    ...(can("user_role_assignment.view")
                      ? [
                          {
                            label: "Manage Roles",
                            onClick: () => nav(`/admin/users/${u._id}`),
                          },
                        ]
                      : []),
                    ...(can("user.login_access.change")
                      ? [
                          {
                            label: "Login Access",
                            onClick: () => nav(`/admin/users/${u._id}`),
                          },
                        ]
                      : []),
                    ...(can("user.status.change")
                      ? [
                          {
                            label: "Account Status",
                            onClick: () => nav(`/admin/users/${u._id}`),
                          },
                        ]
                      : []),
                  ]}
                />
              </article>
            ))}
          </div>
        </>
      )}
      <AddUserModal
        open={add}
        onClose={() => setAdd(false)}
        onCreated={(u) => {
          setAdd(false);
          load();
          setAssign(u);
        }}
      />
      <EditUserModal
        user={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <AssignRoleModal
        open={Boolean(assign)}
        user={assign}
        onClose={() => setAssign(null)}
        onAssigned={() => {
          setAssign(null);
          load();
        }}
      />
    </div>
  );
}
