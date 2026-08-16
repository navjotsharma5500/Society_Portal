import { useEffect, useState } from "react";
import { Button, Input, Modal } from "../../../design-system";
import { updateUser } from "../services/rbacApi";
export default function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
      displayName: "",
      profilePictureUrl: "",
      department: "",
      designation: "",
      contactNumber: "",
    }),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (user)
      setForm({
        displayName: user.displayName,
        profilePictureUrl: user.profilePictureUrl || "",
        department: user.metadata?.department || "",
        designation: user.metadata?.designation || "",
        contactNumber: user.metadata?.contactNumber || "",
      });
  }, [user]);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const { department, designation, contactNumber, ...base } = form;
      await updateUser(user._id, {
        ...base,
        metadata: { department, designation, contactNumber },
      });
      onSaved();
    } catch (e) {
      setError(e.readableMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title="Edit User"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className="rbac-form">
        <Input
          label="Display Name"
          value={form.displayName}
          onChange={(e) => set("displayName", e.target.value)}
        />
        <Input
          type="url"
          label="Profile Picture URL"
          value={form.profilePictureUrl}
          onChange={(e) => set("profilePictureUrl", e.target.value)}
        />
        <Input
          label="Department"
          value={form.department}
          onChange={(e) => set("department", e.target.value)}
        />
        <Input
          label="Designation"
          value={form.designation}
          onChange={(e) => set("designation", e.target.value)}
        />
        <Input
          label="Contact Number"
          value={form.contactNumber}
          onChange={(e) => set("contactNumber", e.target.value)}
        />
        {error && <p className="rbac-error">{error}</p>}
      </div>
    </Modal>
  );
}
