import { useEffect, useState } from "react";
import { LogOut, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  StatusChip,
} from "../../../design-system";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  getOwnProfile,
  updateSocialLinks,
  uploadProfilePhoto,
} from "../services/profileApi";
import "../profile.css";

export default function ProfilePage() {
  const auth = useAuth(),
    navigate = useNavigate(),
    [state, setState] = useState({ loading: true, profile: null, error: "" }),
    [form, setForm] = useState({ githubUrl: "", linkedinUrl: "" }),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  const load = () => {
    setState((old) => ({ ...old, loading: true, error: "" }));
    getOwnProfile()
      .then((profile) => {
        setState({ loading: false, profile, error: "" });
        setForm({
          githubUrl: profile.user.githubUrl || "",
          linkedinUrl: profile.user.linkedinUrl || "",
        });
      })
      .catch((error) =>
        setState({
          loading: false,
          profile: null,
          error: error.readableMessage,
        })
      );
  };
  useEffect(load, []);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const profile = await updateSocialLinks(form);
      setState({ loading: false, profile, error: "" });
      setNotice("Social links updated.");
    } catch (error) {
      setNotice(error.readableMessage);
    } finally {
      setSaving(false);
    }
  };
  const photo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setNotice("");
    try {
      await uploadProfilePhoto(file);
      await auth.loadCurrentUser({ fresh: true });
      load();
      setNotice("Profile photo updated.");
    } catch (error) {
      setNotice(error.readableMessage);
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  };
  const logout = async () => {
    const student = auth.isStudent;
    await auth.logout();
    navigate(student ? "/student-login" : "/staff-login", { replace: true });
  };
  if (state.loading) return <Skeleton lines={9} />;
  if (state.error || !state.profile)
    return (
      <EmptyState
        title="Profile unavailable"
        description={state.error}
        action={<Button onClick={load}>Retry</Button>}
      />
    );
  const { user, student, primaryRole, roles, memberships, leadership } =
    state.profile;
  return (
    <div className="page-stack profile-page">
      <PageHeader
        title="Profile"
        description="Your authoritative portal identity and active workspaces."
        actions={
          <Button variant="danger" icon={LogOut} onClick={logout}>
            Logout
          </Button>
        }
      />
      <Card>
        <div className="profile-header">
          <Avatar name={user.displayName} src={user.profilePhotoUrl} />
          <div>
            <h2>{user.displayName}</h2>
            <p>
              {user.publicId || "Portal user"} ·{" "}
              {primaryRole?.name || user.accountType}
            </p>
          </div>
          <label className="profile-photo-action">
            <Upload size={17} />
            Change Photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={photo}
            />
          </label>
        </div>
        <p className="muted">JPEG, PNG, or WebP · maximum 1 MB</p>
      </Card>
      {notice && <p className="profile-notice">{notice}</p>}
      <div className="profile-grid">
        <Card title="Official Identity">
          <dl className="profile-details">
            <dt>Full name</dt>
            <dd>{user.displayName}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Contact/mobile</dt>
            <dd>{user.contactNumber || "—"}</dd>
            <dt>User ID</dt>
            <dd>{user.publicId || "—"}</dd>
            <dt>Department</dt>
            <dd>{user.department || "—"}</dd>
            {student && (
              <>
                <dt>Roll Number</dt>
                <dd>{student.rollNumber || "—"}</dd>
                <dt>Course</dt>
                <dd>
                  {[student.course, student.branch, student.year]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </>
            )}
          </dl>
          <small className="muted">
            Need to update official details? Please contact the portal
            administrator.
          </small>
        </Card>
        <Card title="Roles and Workspaces">
          <div className="profile-chips">
            {roles.length ? (
              roles.map((role) => (
                <Badge key={role.assignmentId}>
                  {role.roleName}
                  {role.society ? ` · ${role.society.name}` : ""}
                </Badge>
              ))
            ) : (
              <span className="muted">No active role assignments.</span>
            )}
          </div>
        </Card>
      </div>
      <Card title="Social Links">
        <form className="profile-social-form" onSubmit={save}>
          <Input
            type="url"
            label="GitHub URL"
            placeholder="https://github.com/username"
            value={form.githubUrl}
            onChange={(event) =>
              setForm({ ...form, githubUrl: event.target.value })
            }
          />
          <Input
            type="url"
            label="LinkedIn URL"
            placeholder="https://www.linkedin.com/in/username"
            value={form.linkedinUrl}
            onChange={(event) =>
              setForm({ ...form, linkedinUrl: event.target.value })
            }
          />
          <Button type="submit" loading={saving}>
            Save Social Links
          </Button>
        </form>
      </Card>
      <div className="profile-grid">
        <Card title="Societies and Memberships">
          {memberships.length ? (
            memberships.map((item) => (
              <div className="profile-list-row" key={item.publicId}>
                <span>
                  <b>{item.society?.name}</b>
                  <small>
                    {item.society?.code} · {item.roleName}
                  </small>
                </span>
                <StatusChip status={item.status} />
              </div>
            ))
          ) : (
            <p className="muted">No society memberships recorded.</p>
          )}
        </Card>
        <Card title="Leadership">
          {leadership.length ? (
            leadership.map((item, index) => (
              <div
                className="profile-list-row"
                key={`${item.society?.code}-${item.role}-${index}`}
              >
                <span>
                  <b>{item.society?.name}</b>
                  <small>
                    {item.role.replaceAll("_", " ")}
                    {item.designation ? ` · ${item.designation}` : ""}
                  </small>
                </span>
              </div>
            ))
          ) : (
            <p className="muted">No active leadership records.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
