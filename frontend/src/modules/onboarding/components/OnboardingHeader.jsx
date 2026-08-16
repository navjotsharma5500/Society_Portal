import {ShieldCheck} from 'lucide-react'
import TietLogo from '../../../components/branding/TietLogo'
export default function OnboardingHeader({resume=false}){return <header className="onboarding-header"><div><TietLogo size="small"/><span><b>TIET Society Portal</b><small>Student onboarding</small></span></div><div><ShieldCheck size={15}/>{resume?'Resume your onboarding':'Secure profile setup'}</div></header>}
