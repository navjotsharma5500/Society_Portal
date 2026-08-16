import { NavLink } from 'react-router-dom'
import { navigationItems } from './navConfig'
import { useToast } from '../common/toastContext'
import { useCapability } from '../../modules/rbac/hooks/useCapability'
export default function MobileBottomNav(){const{notify}=useToast(),can=useCapability();return <nav className="bottom-nav mobile-only" aria-label="Primary navigation">{navigationItems.filter(item=>!item.permissionKey||can(item.permissionKey)).map(({label,to,icon:Icon})=>to?<NavLink key={label} end={to==='/admin'} to={to} className={({isActive})=>`nav-item ${isActive?'active':''}`}><Icon size={20}/><span>{label}</span></NavLink>:<button key={label} className="nav-item" onClick={()=>notify(`${label} is coming soon`,'info')}><Icon size={20}/><span>{label}</span></button>)}</nav>}
