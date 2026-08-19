import { Menu } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import DesktopSidebar from "../components/navigation/DesktopSidebar";
import MobileBottomNav from "../components/navigation/MobileBottomNav";
import NotificationButton from "../components/navigation/NotificationButton";
import ProfileButton from "../components/navigation/ProfileButton";
import { dosaNavigationItems } from "../components/navigation/navConfig";
import ContextSwitcher from "../modules/portal/components/ContextSwitcher";
import { useAuth } from "../modules/auth/hooks/useAuth";
const titleFor = (path) => (path.includes("/events") ? "Event Approvals" : "Dashboard");
export default function DosaLayout() {
  const { dashboardContexts } = useAuth();
  const location = useLocation(),
    [collapsed, setCollapsed] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false),
    title = titleFor(location.pathname);
  if (!dashboardContexts.some((context) => context.type === "GLOBAL" && context.roleCode === "DOSA"))
    return <Navigate to="/portal" replace />;
  return (
    <div className={`app-shell ${collapsed ? "shell-collapsed" : ""}`}>
      <DesktopSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((x) => !x)}
        navigationItems={dosaNavigationItems}
        brandLabel="DoSA Console"
      />
      {mobileOpen && (
        <>
          <button
            className="mobile-drawer-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <DesktopSidebar
            mobile
            onClose={() => setMobileOpen(false)}
            navigationItems={dosaNavigationItems}
            brandLabel="DoSA Console"
          />
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
          <span className="topbar-crumb">DoSA / {title}</span>
          <div className="header-actions">
            <ContextSwitcher />
            <NotificationButton />
            <ProfileButton />
          </div>
        </header>
        <header className="desktop-topbar desktop-only">
          <span className="topbar-crumb">
            DoSA <b>/</b> {title}
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
      <MobileBottomNav navigationItems={dosaNavigationItems} />
    </div>
  );
}
