import {Button,EmptyState} from '../../../design-system'
import {useNavigate} from 'react-router-dom'
export default function UnsupportedContextPage(){const navigate=useNavigate();return <main className="portal-selector"><EmptyState title="Workspace coming soon" description="This role is valid, but its dashboard has not been implemented yet." action={<Button onClick={()=>navigate('/portal')}>Choose another workspace</Button>}/></main>}
