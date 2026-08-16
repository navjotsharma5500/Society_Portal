import {useLocation} from 'react-router-dom'
import {Card,PageContainer,PageHeader} from '../../../design-system'
import '../student-auth.css'
const content={onboarding:['Student Onboarding','Student Onboarding will be implemented in the next step.'],verification:['Profile Verification','Your submitted profile and society claims are being reviewed.'],dashboard:['Student Dashboard','The Student Dashboard will be implemented in a future step.']}
export default function StudentPlaceholderPage(){const key=useLocation().pathname.split('/').pop(),[title,message]=content[key]||content.dashboard;return <main className="student-placeholder"><PageContainer><PageHeader eyebrow="TIET Society Portal" title={title} description="Campus Connect student experience"/><Card><h3>{message}</h3><p>This protected placeholder confirms that authentication routing is ready. No business module has been added.</p></Card></PageContainer></main>}
