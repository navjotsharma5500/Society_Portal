import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Save, Search } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, StatusChip } from "../../../design-system";
import { getPermissionCatalog, getRole, getRolePermissions, replaceRolePermissions } from "../services/rbacApi";
import { useCapability } from "../hooks/useCapability";
import { treeSelectionState } from "../utils/permissions";

function TreeCheckbox({ checked, indeterminate, onChange, label, disabled }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <label className="permission-tree-check"><input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

export default function RoleDetailsPage() {
  const { roleId } = useParams(), nav = useNavigate(), can = useCapability();
  const [role, setRole] = useState(null), [catalog, setCatalog] = useState({}), [selected, setSelected] = useState(new Set()), [expanded, setExpanded] = useState(new Set()), [query, setQuery] = useState(""), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [loadedRole, tree, mappings] = await Promise.all([getRole(roleId), getPermissionCatalog(), getRolePermissions(roleId)]);
      setRole(loadedRole); setCatalog(tree); setExpanded(new Set(Object.keys(tree)));
      setSelected(new Set(mappings.filter((item) => item.effect === "ALLOW").map((item) => String(item.permissionId?._id || item.permissionId))));
    } catch (e) { setError(e.readableMessage); } finally { setLoading(false); }
  }, [roleId]);
  useEffect(() => { load(); }, [load]);
  const modules = useMemo(() => Object.entries(catalog).map(([module, groups]) => {
    const permissions = Object.values(groups).flat();
    const resources = Object.groupBy(permissions, (permission) => permission.resource);
    return { module, permissions, resources };
  }), [catalog]);
  const visibleModules = useMemo(() => !query.trim() ? modules : modules.map((module) => ({ ...module, resources: Object.fromEntries(Object.entries(module.resources).map(([resource, permissions]) => [resource, permissions.filter((permission) => `${permission.code} ${permission.name} ${permission.description || ""}`.toLowerCase().includes(query.toLowerCase()))]).filter(([, permissions]) => permissions.length)) })).filter((module) => Object.keys(module.resources).length), [modules, query]);
  const readonly = role?.code === "SUPER_ADMIN" || !can("role.permissions.manage");
  const displayedSelection = role?.code === "SUPER_ADMIN" ? new Set(modules.flatMap((item) => item.permissions.map((permission) => String(permission._id)))) : selected;
  const toggle = (permissions, checked) => setSelected((current) => { const next = new Set(current); permissions.forEach((permission) => { if (checked) next.add(String(permission._id)); else next.delete(String(permission._id)); }); return next; });
  const save = async () => { setSaving(true); setError(""); try { await replaceRolePermissions(roleId, [...selected].map((permissionId) => ({ permissionId, effect: "ALLOW", dataScope: "NONE" }))); await load(); } catch (e) { setError(e.readableMessage); } finally { setSaving(false); } };
  if (loading) return <Skeleton lines={10} />;
  if (!role) return <EmptyState title="Role unavailable" description={error} action={<Button onClick={load}>Retry</Button>} />;
  return <div className="page-stack rbac-page">
    <Button variant="ghost" icon={ArrowLeft} onClick={() => nav("/admin/roles")}>Back to roles</Button>
    <PageHeader title={role.name} description={role.description || role.code} actions={!readonly && <Button icon={Save} loading={saving} onClick={save}>Save Changes</Button>} />
    <Card><div className="rbac-role-meta"><span><small>Code</small><code>{role.code}</code></span><span><small>Category</small>{role.category}</span><span><small>Scope</small><Badge tone="info">{role.scopeType}</Badge></span><span><small>Status</small><StatusChip status={role.status} /></span><span><small>Access</small>{role.code === "SUPER_ADMIN" ? "Automatic full access" : "Direct role permissions"}</span><span><small>Selected</small>{role.code === "SUPER_ADMIN" ? "All registered" : `${selected.size}`}</span></div></Card>
    {error && <p className="rbac-error">{error}</p>}
    <section className="permission-matrix">
      <header><div><h3>{role.code === "SUPER_ADMIN" ? "Effective Permissions" : "Direct Permissions"}</h3><p>Permissions are grouped by module, resource, and business action.</p></div><div><Button variant="outline" onClick={() => setExpanded(new Set(modules.map((item) => item.module)))}>Expand All</Button><Button variant="ghost" onClick={() => setExpanded(new Set())}>Collapse All</Button></div></header>
      <label className="permission-tree-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search permissions" /></label>
      {visibleModules.map(({ module, permissions, resources }) => { const moduleState = treeSelectionState(permissions.map((item) => String(item._id)), displayedSelection), open = expanded.has(module) || Boolean(query); return <article className="permission-module" key={module}>
        <header><button className="permission-tree-toggle" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(module)) next.delete(module); else next.add(module); return next; })}>{open ? <ChevronDown /> : <ChevronRight />}</button><TreeCheckbox {...moduleState} disabled={readonly} label={`${module} (${permissions.length})`} onChange={(checked) => toggle(permissions, checked)} /></header>
        {open && <div className="permission-tree-resources">{Object.entries(resources).map(([resource, items]) => { const resourceState = treeSelectionState(items.map((item) => String(item._id)), displayedSelection); return <section key={resource}><TreeCheckbox {...resourceState} disabled={readonly} label={resource.replaceAll(".", " ")} onChange={(checked) => toggle(items, checked)} /><div className="permission-tree-actions">{items.map((permission) => <TreeCheckbox key={permission._id} checked={displayedSelection.has(String(permission._id))} indeterminate={false} disabled={readonly} label={<><b>{permission.action.replaceAll("_", " ")}</b><code>{permission.code}</code></>} onChange={(checked) => toggle([permission], checked)} />)}</div></section>; })}</div>}
      </article>; })}
    </section>
    {!readonly && <div className="permission-save-bar"><span>{selected.size} direct permissions selected</span><Button icon={Save} loading={saving} onClick={save}>Save Changes</Button></div>}
  </div>;
}
