import { Bell } from 'lucide-react'
import { useToast } from '../common/toastContext'
export default function NotificationButton(){const{notify}=useToast();return <button className="icon-button" aria-label="Notifications" onClick={()=>notify('Notifications are coming soon','info')}><Bell size={20}/></button>}
