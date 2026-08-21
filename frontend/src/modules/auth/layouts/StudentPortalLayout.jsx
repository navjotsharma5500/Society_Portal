import { Bell, CalendarDays, ClipboardList, House, Menu, Plus, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "../../../design-system";
import { AppNavLinks, AppShell, MobileDrawer, ProfileAvatar, QuickActionSheet } from "../../../components/app-shell/AppShell";
import { useAuth } from "../hooks/useAuth";
import "./student-portal.css";
import "./student-context.css";

// Per-user Society-context persistence (sessionStorage only — never the whole context object, just
// the societyId). Namespaced by userId so switching accounts in the same browser tab can never
// inherit another user's selection, and a first-time/unrecognized user simply reads nothing back.
const societyStorageKey = (userId) => `tiet.student.selectedSociety.${userId}`;
const readPersistedSociety = (userId) => {
  if (!userId) return "";
  try {
    return sessionStorage.getItem(societyStorageKey(userId)) || "";
  } catch {
    return "";
  }
};
const writePersistedSociety = (userId, societyId) => {
  if (!userId) return;
  try {
    sessionStorage.setItem(societyStorageKey(userId), societyId);
  } catch {
    // sessionStorage may be unavailable (private mode, storage quota); the in-memory selection
    // still works for the current tab, it just won't survive a hard refresh.
  }
};

const base = [
  { label: "Home", to: "/student/dashboard", icon: House, end: true },
  { label: "My Societies", to: "/student/societies", icon: UsersRound },
  { label: "Requests & Status", to: "/student/requests", icon: ClipboardList },
  { label: "Notifications", to: "/student/notifications", icon: Bell },
  { label: "Profile", to: "/student/profile", icon: UserRound },
];
const hasPermission = (context, code) => (context?.permissions || []).some((item) => (item.code || item) === code);
const titles = { dashboard: "Home", societies: "My Societies", requests: "Requests & Status", notifications: "Notifications", profile: "Profile", events: "Events", approvals: "Approvals" };

export default function StudentPortalLayout() {
  const auth = useAuth(), navigate = useNavigate(), location = useLocation(), userId = auth.user?.id, contexts = useMemo(() => auth.activeSocietyContexts || [], [auth.activeSocietyContexts]), [selectedSocietyId, setSelectedSocietyId] = useState(""), [drawerOpen, setDrawerOpen] = useState(false), [actionsOpen, setActionsOpen] = useState(false);
  // Restores the per-user persisted Society (falling back to contexts[0] only when nothing valid is
  // persisted) instead of always defaulting to contexts[0] on every hydration/hard refresh. Uses the
  // functional setState form so this effect never needs selectedSocietyId itself as a dependency —
  // it only re-evaluates when the contexts list or the authenticated user actually changes.
  useEffect(() => {
    if (!contexts.length) return;
    setSelectedSocietyId((current) => {
      if (contexts.some((item) => String(item.societyId) === current)) return current;
      const persisted = readPersistedSociety(userId);
      if (persisted && contexts.some((item) => String(item.societyId) === persisted)) return persisted;
      return String(contexts[0]?.societyId || "");
    });
  }, [contexts, userId]);
  useEffect(() => { setDrawerOpen(false); setActionsOpen(false); }, [location.pathname]);
  useEffect(() => { const close = (event) => event.key === "Escape" && (setDrawerOpen(false), setActionsOpen(false)); document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, []);
  const selected = useMemo(() => contexts.find((item) => String(item.societyId) === selectedSocietyId) || contexts[0] || null, [contexts, selectedSocietyId]), canApprove = hasPermission(selected, "membership.request.approve") || hasPermission(selected, "onboarding.claim.approve"), canViewEvents = hasPermission(selected, "event.view") || hasPermission(selected, "event.list_society"), canCreateEvent = hasPermission(selected, "event.create"), contextItems = [
    ...(canViewEvents ? [{ label: "Events", to: "/student/events", icon: CalendarDays }] : []),
    ...(canApprove ? [{ label: "Approvals", to: `/student/society/${selected.societyId}/approvals`, icon: ShieldCheck }] : []),
  ], items = [...base, ...contextItems], quickActions = [
    ...(auth.membership?.joinSocietyAvailable ? [{ label: "Join a Society", description: "Browse active societies", icon: UsersRound, onClick: () => navigate("/student/societies") }] : []),
    ...(canCreateEvent ? [{ label: "Create Event", description: `For ${selected?.societyName}`, icon: CalendarDays, onClick: () => navigate("/student/events/new") }] : []),
    { label: "Requests & Status", description: "Track your submissions", icon: ClipboardList, onClick: () => navigate("/student/requests") },
    { label: "My Profile", description: "View your portal identity", icon: UserRound, onClick: () => navigate("/student/profile") },
  ], pageKey = location.pathname.split("/").filter(Boolean).pop(), pageTitle = titles[pageKey] || (location.pathname.includes("approvals") ? "Approvals" : location.pathname.includes("events") ? "Events" : "Student Portal");
  const switchContext = (context) => { if (String(context.societyId) === String(selected?.societyId)) return; if (location.pathname.startsWith("/student/events") && !window.confirm("Leave this Event and switch society? Unsaved changes may be lost.")) return; const societyId = String(context.societyId); setSelectedSocietyId(societyId); writePersistedSociety(userId, societyId); navigate("/student/dashboard"); };
  // Narrow function exposed to child routes (via Outlet context) so pages never reach into layout
  // internals directly — e.g. a directly-opened Event URL synchronizes the Society tab to the
  // Event's own Society. Persists like an explicit switch by default (pass { persist: false } to
  // opt out) since the Student is now effectively viewing that Society context.
  const selectSocietyById = useCallback(
    (societyId, options = {}) => {
      const id = String(societyId || "");
      if (!id || !contexts.some((item) => String(item.societyId) === id)) return false;
      setSelectedSocietyId((current) => (current === id ? current : id));
      if (options.persist !== false) writePersistedSociety(userId, id);
      return true;
    },
    [contexts, userId]
  );
  if (auth.contextLoading) return <div className="student-shell-loading"><Skeleton lines={8} /></div>;
  const sidebar = <div className="student-sidebar"><div className="student-sidebar__brand"><span>TS</span><div><strong>TIET Society</strong><small>Student Portal</small></div></div><AppNavLinks items={items} className="student-sidebar__nav" /><div className="student-sidebar__profile"><ProfileAvatar user={auth.user} /><div><strong>{auth.user?.displayName}</strong><small>{auth.student?.rollNumber || "Student"}</small></div></div></div>;
  const header = <header className="student-app-header"><button className="app-icon-button student-app-header__menu" type="button" aria-label="Open menu" onClick={() => setDrawerOpen(true)}><Menu size={21} /></button><div className="student-app-header__title"><small>Student Portal</small><strong>{pageTitle}</strong></div><div className="student-context-tabs" aria-label="Society context">{contexts.map((context) => <button className={context.id === selected?.id ? "active" : ""} key={context.id} onClick={() => switchContext(context)}><b>{context.societyName}</b><small>{context.roleName}</small></button>)}</div><NavLink className="app-icon-button student-app-header__notification" to="/student/notifications" aria-label="Notifications"><Bell size={20} /></NavLink><NavLink className="student-app-header__identity" to="/student/profile" aria-label="Open profile"><ProfileAvatar user={auth.user} /><span><b>{auth.user?.displayName}</b><small>{auth.student?.rollNumber || "Student"}</small></span></NavLink></header>;
  const bottomNav = <nav className="student-bottom-nav" aria-label="Primary mobile navigation"><NavLink end to="/student/dashboard"><House /><span>Home</span></NavLink><NavLink to="/student/societies"><UsersRound /><span>Societies</span></NavLink><button type="button" aria-label="Open quick actions" onClick={() => setActionsOpen(true)}><span><Plus /></span><small>Actions</small></button><NavLink to="/student/notifications"><Bell /><span>Notifications</span></NavLink><NavLink to="/student/profile"><UserRound /><span>Profile</span></NavLink></nav>;
  return <><AppShell sidebar={sidebar} header={header} bottomNav={bottomNav}><Outlet context={{ selectedContext: selected, refreshContexts: auth.loadCurrentUser, selectSocietyById }} /></AppShell><MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} user={auth.user} student={auth.student} context={selected} items={items} onLogout={async () => { await auth.logout(); navigate("/student-login", { replace: true }); }} /><QuickActionSheet open={actionsOpen} onClose={() => setActionsOpen(false)} actions={quickActions} /></>;
}
