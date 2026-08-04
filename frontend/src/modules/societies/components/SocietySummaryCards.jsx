import { Building2, CircleCheck, CircleOff, Files } from 'lucide-react'
import DashboardStatCard from '../../dashboard/components/DashboardStatCard'
export default function SocietySummaryCards({pagination,active,inactive}){return <div className="stats-grid"><DashboardStatCard icon={Building2} label="Total" value={pagination.totalItems??0}/><DashboardStatCard icon={CircleCheck} label="Active" value={active}/><DashboardStatCard icon={CircleOff} label="Inactive" value={inactive}/><DashboardStatCard icon={Files} label="Current Page" value={pagination.page??1}/></div>}
