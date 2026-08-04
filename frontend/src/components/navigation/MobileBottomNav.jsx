import { NavLink } from 'react-router-dom'
import { navigationItems } from './navConfig'
import { useToast } from '../common/toastContext'
export default function MobileBottomNav(){const{notify}=useToast();return <nav className="bottom-nav mobile-only" aria-label="Primary navigation">{navigationItems.map(({label,to,icon:Icon})=>to?<NavLink key={label} end={to==='/admin'} to={to} className={({isActive})=>`nav-item ${isActive?'active':''}`}><Icon size={20}/><span>{label}</span></NavLink>:<button key={label} className="nav-item" onClick={()=>notify(`${label} is coming soon`,'info')}><Icon size={20}/><span>{label}</span></button>)}</nav>}
