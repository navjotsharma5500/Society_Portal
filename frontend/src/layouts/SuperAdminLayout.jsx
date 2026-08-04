import { Menu } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import DesktopSidebar from '../components/navigation/DesktopSidebar'
import MobileBottomNav from '../components/navigation/MobileBottomNav'
import NotificationButton from '../components/navigation/NotificationButton'
import ProfileButton from '../components/navigation/ProfileButton'
const titleFor=(path)=>path.includes('/societies/')?'Society Details':path.includes('/societies')?'Societies':'Dashboard'
export default function SuperAdminLayout(){const location=useLocation();const title=titleFor(location.pathname);return <div className="app-shell"><DesktopSidebar/><div className="desktop-area"><header className="mobile-header mobile-only"><button className="icon-button" aria-label="Open menu"><Menu size={21}/></button><h1>{title}</h1><div className="header-actions"><NotificationButton/><ProfileButton/></div></header><header className="desktop-topbar desktop-only"><h1>{title}</h1><div className="header-actions"><NotificationButton/><ProfileButton/></div></header><motion.main key={location.pathname} className="main-content" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}><Outlet/></motion.main></div><MobileBottomNav/></div>}
