import {Card} from '../../../design-system'
export default function SocietyPlaceholderPage({approvals=false}){return <Card title={approvals?'Approvals':'Workspace section'}><p>{approvals?'Approval Center will be implemented in the next milestone.':'This workspace section will be implemented in a future milestone.'}</p></Card>}
