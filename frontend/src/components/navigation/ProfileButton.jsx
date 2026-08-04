import { useToast } from '../common/toastContext'
export default function ProfileButton(){const{notify}=useToast();return <button className="avatar-button" aria-label="Super Admin profile" onClick={()=>notify('Profile is coming soon','info')}>SA</button>}
