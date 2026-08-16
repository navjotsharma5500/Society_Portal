import { Menu } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import DesktopSidebar from "../components/navigation/DesktopSidebar";
import MobileBottomNav from "../components/navigation/MobileBottomNav";
import NotificationButton from "../components/navigation/NotificationButton";
import ProfileButton from "../components/navigation/ProfileButton";
import ContextSwitcher from "../modules/portal/components/ContextSwitcher";
const titleFor = (path) =>
  path.includes("/design-system")
    ? "Design System"
    : path.includes("/events")
    ? "Events"
    : path.includes("/settings")
    ? "Settings"
    : path.includes("/budgets")
    ? "Budget"
    : path.includes("/users/")
    ? "User Details"
    : path.includes("/users")
    ? "Users"
    : path.includes("/roles/")
    ? "Role Details"
    : path.includes("/roles")
    ? "Roles & Permissions"
    : path.includes("/permissions")
    ? "Permissions"
    : path.includes("/societies/")
    ? "Society Details"
    : path.includes("/societies")
    ? "Societies"
    : path.includes("/students")
    ? "Students"
    : "Dashboard";
export default function SuperAdminLayout() {
  const location = useLocation(),
    [collapsed, setCollapsed] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false),
    title = titleFor(location.pathname);
  return (
    <div className={`app-shell ${collapsed ? "shell-collapsed" : ""}`}>
      <DesktopSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((x) => !x)}
      />
      {mobileOpen && (
        <>
          <button
            className="mobile-drawer-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <DesktopSidebar mobile onClose={() => setMobileOpen(false)} />
        </>
      )}
      <div className="desktop-area">
        <header className="mobile-header mobile-only">
          <button
            className="icon-button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={19} />
          </button>
          <span className="topbar-crumb">Admin / {title}</span>
          <div className="header-actions">
            <ContextSwitcher />
            <NotificationButton />
            <ProfileButton />
          </div>
        </header>
        <header className="desktop-topbar desktop-only">
          <span className="topbar-crumb">
            Admin <b>/</b> {title}
          </span>
          <div className="header-actions">
            <ContextSwitcher />
            <NotificationButton />
            <ProfileButton />
          </div>
        </header>
        <motion.main
          key={location.pathname}
          className="main-content"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Outlet />
        </motion.main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
