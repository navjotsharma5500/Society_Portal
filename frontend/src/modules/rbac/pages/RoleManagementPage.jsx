import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
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
  changeRoleStatus,
  listRoleOverview,
} from "../services/rbacApi";
import RoleFormModal from "../components/RoleFormModal";
import { useCapability } from "../hooks/useCapability";
export default function RoleManagementPage() {
  const nav = useNavigate(),
    can = useCapability(),
    [roles, setRoles] = useState([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [edit, setEdit] = useState(undefined);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listRoleOverview({ limit: 100 });
      setRoles(r.items);
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
      roles.filter(
        (r) =>
          (!search ||
            `${r.name} ${r.code}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (!status || r.status === status)
      ),
    [roles, search, status]
  );
  return (
    <div className="page-stack rbac-page">
      <PageHeader
        title="Roles & Permissions"
        description="Manage dynamic roles, scope rules and permission assignments."
        actions={<div className="rbac-actions">{can("permission.view") && <Button variant="outline" onClick={() => nav("/admin/permissions")}>Permission Catalog</Button>}{can("role.create") && <Button icon={Plus} onClick={() => setEdit(null)}>Create Custom Role</Button>}</div>}
      />
      <div className="rbac-filters rbac-filters--small">
        <SearchBox
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search roles…"
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: "All statuses" },
            "ACTIVE",
            "INACTIVE",
            "ARCHIVED",
          ]}
        />
      </div>
      {loading ? (
        <Skeleton lines={8} />
      ) : error ? (
        <EmptyState
          title="Roles unavailable"
          description={error}
          action={<Button onClick={load}>Retry</Button>}
        />
      ) : (
        <div className="rbac-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Role Name</th>
                <th>Role Code</th>
                <th>Category</th>
                <th>Scope</th>
                <th>Rank</th>
                <th>Status</th>
                <th>System / Custom</th>
                <th>Permissions</th>
                <th>Assignments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r._id}>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td>
                    <code>{r.code}</code>
                  </td>
                  <td>{r.category}</td>
                  <td>
                    <Badge tone="info">{r.scopeType}</Badge>
                  </td>
                  <td>{r.rank}</td>
                  <td>
                    <StatusChip status={r.status} />
                  </td>
                  <td>{r.isSystemRole ? "System" : "Custom"}</td>
                  <td>{r.permissionCount}</td>
                  <td>{r.activeAssignmentCount}</td>
                  <td>
                    <Dropdown
                      items={[
                        {
                          label: "View Role",
                          onClick: () => nav(`/admin/roles/${r._id}`),
                        },
                        ...(can("role.permissions.manage") ? [{label:"Manage Permissions",onClick:()=>nav(`/admin/roles/${r._id}`)}] : []),
                        ...(can("user_role_assignment.view") ? [{label:"View Assignments",onClick:()=>nav(`/admin/users?role=${r._id}`)}] : []),
                        ...(r.code!=="SUPER_ADMIN"&&can("role.edit")
                          ? [{ label: "Edit", onClick: () => setEdit(r) }]
                          : []),
                        ...(r.code!=="SUPER_ADMIN"&&can("role.status.change")
                          ? [
                              {
                                label:
                                  r.status === "ACTIVE"
                                    ? "Deactivate"
                                    : "Activate",
                                onClick: async () => {
                                  await changeRoleStatus(
                                    r._id,
                                    r.status === "ACTIVE"
                                      ? "INACTIVE"
                                      : "ACTIVE"
                                  );
                                  load();
                                },
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
      )}
      <RoleFormModal
        open={edit !== undefined}
        role={edit}
        onClose={() => setEdit(undefined)}
        onSaved={() => {
          setEdit(undefined);
          load();
        }}
      />
    </div>
  );
}
