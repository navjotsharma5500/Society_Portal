import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Input, Modal, Select } from "../../../design-system";
import { listRoles, assignRole } from "../services/rbacApi";
import { listSocieties } from "../../../services/societyApi";
const init = {
  roleId: "",
  scopeType: "GLOBAL",
  societyId: "",
  academicSession: "",
  validFrom: "",
  validUntil: "",
  isOngoing: true,
};
export default function AssignRoleModal({ open, user, onClose, onAssigned }) {
  const [form, setForm] = useState(init),
    [roles, setRoles] = useState([]),
    [societies, setSocieties] = useState([]),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(init);
    setError("");
    Promise.all([
      listRoles({ status: "ACTIVE", limit: 100 }),
      listSocieties({ isActive: true, limit: 100 }),
    ])
      .then(([r, s]) => {
        setRoles(r.items.filter((x) => x.isAssignable));
        setSocieties(s.items);
      })
      .catch((e) => setError(e.readableMessage));
  }, [open]);
  const eligible = useMemo(
    () =>
      roles.filter(
        (r) =>
          r.code !== "SUPER_ADMIN" &&
          (r.scopeType === form.scopeType || r.scopeType === "BOTH") &&
          (user?.accountType === "STUDENT" ? r.isStudentRole : !r.isStudentRole)
      ),
    [roles, form.scopeType, user?.accountType]
  );
  useEffect(() => {
    if (form.roleId && !eligible.some((r) => r._id === form.roleId))
      setForm((x) => ({ ...x, roleId: "" }));
  }, [eligible, form.roleId]);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await assignRole({
        userId: user._id,
        ...form,
        societyId: form.scopeType === "SOCIETY" ? form.societyId : null,
        academicSession: form.academicSession || null,
        validFrom: form.validFrom || null,
        validUntil: form.isOngoing ? null : form.validUntil || null,
      });
      onAssigned();
    } catch (e) {
      setError(e.readableMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign Role"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={
              !form.roleId || (form.scopeType === "SOCIETY" && !form.societyId)
            }
            onClick={submit}
          >
            Assign Role
          </Button>
        </>
      }
    >
      <div className="rbac-form">
        <Select
          label="Scope"
          value={form.scopeType}
          onChange={(e) => set("scopeType", e.target.value)}
          options={["GLOBAL", "SOCIETY"]}
        />
        <Select
          label="Role"
          value={form.roleId}
          onChange={(e) => set("roleId", e.target.value)}
          options={[
            { value: "", label: "Select role" },
            ...eligible.map((r) => ({
              value: r._id,
              label: `${r.name} (${r.code})`,
            })),
          ]}
        />
        {form.scopeType === "SOCIETY" && (
          <Select
            label="Society"
            value={form.societyId}
            onChange={(e) => set("societyId", e.target.value)}
            options={[
              { value: "", label: "Select society" },
              ...societies.map((s) => ({ value: s._id, label: `${s.name} (${s.code})` })),
            ]}
          />
        )}
        <Input
          label="Academic Session"
          placeholder="2026-27"
          value={form.academicSession}
          onChange={(e) => set("academicSession", e.target.value)}
        />
        <Input
          type="date"
          label="Start Date"
          value={form.validFrom}
          onChange={(e) => set("validFrom", e.target.value)}
        />
        <Checkbox
          label="Ongoing"
          checked={form.isOngoing}
          onChange={(e) => set("isOngoing", e.target.checked)}
        />
        {!form.isOngoing && (
          <Input
            type="date"
            label="End Date"
            value={form.validUntil}
            onChange={(e) => set("validUntil", e.target.value)}
          />
        )}{" "}
        {error && <p className="rbac-error">{error}</p>}
      </div>
    </Modal>
  );
}
