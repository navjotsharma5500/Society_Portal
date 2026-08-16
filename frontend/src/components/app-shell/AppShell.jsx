import { AnimatePresence, motion } from "framer-motion";
import { LogOut, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Avatar } from "../../design-system";
import "./app-shell.css";

export function AppShell({ sidebar, header, bottomNav, children }) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">{sidebar}</aside>
      <div className="app-shell__body">
        {header}
        <main className="app-shell__content">{children}</main>
      </div>
      {bottomNav}
    </div>
  );
}

export function ProfileAvatar({ user, size = "md" }) {
  return <Avatar name={user?.displayName || "Student"} src={user?.profilePictureUrl} size={size} />;
}

export function AppNavLinks({ items, onNavigate, className = "" }) {
  return (
    <nav className={className} aria-label="Portal navigation">
      {items.map(({ label, to, icon: Icon, end }) => (
        <NavLink end={end} key={to} to={to} onClick={onNavigate}>
          <Icon aria-hidden="true" size={19} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function MobileDrawer({ open, onClose, user, student, context, items, onLogout }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="app-drawer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
          <motion.aside className="app-drawer" role="dialog" aria-modal="true" aria-label="Portal menu" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}>
            <button className="app-icon-button app-drawer__close" type="button" aria-label="Close menu" onClick={onClose}><X size={21} /></button>
            <div className="app-drawer__profile">
              <ProfileAvatar user={user} size="lg" />
              <div><strong>{user?.displayName || "Student"}</strong><span>{student?.email || user?.email}</span><small>{student?.rollNumber || "Student"}</small></div>
            </div>
            {context && <div className="app-drawer__context"><span>Current workspace</span><strong>{context.societyName}</strong><small>{context.roleName}</small></div>}
            <AppNavLinks items={items} onNavigate={onClose} className="app-drawer__nav" />
            <button className="app-drawer__logout" type="button" onClick={onLogout}><LogOut size={18} /> Log out</button>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function QuickActionSheet({ open, onClose, actions }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="app-sheet-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
          <motion.section className="app-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-actions-title" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}>
            <span className="app-sheet__handle" />
            <header><div><span>Student portal</span><h2 id="quick-actions-title">Quick actions</h2></div><button className="app-icon-button" type="button" aria-label="Close quick actions" onClick={onClose}><X size={20} /></button></header>
            <div className="app-sheet__actions">
              {actions.map(({ label, description, icon: Icon, onClick }) => <button type="button" key={label} onClick={() => { onClick(); onClose(); }}><span><Icon size={20} /></span><div><strong>{label}</strong><small>{description}</small></div></button>)}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
