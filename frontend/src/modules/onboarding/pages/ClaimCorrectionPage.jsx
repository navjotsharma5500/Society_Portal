import {useEffect,useState} from 'react'
import {useNavigate,useParams} from 'react-router-dom'
import {AlertTriangle,ArrowLeft,Send} from 'lucide-react'
import {Button,Card,EmptyState,PageContainer,PageHeader,Skeleton} from '../../../design-system'
import {useToast} from '../../../components/common/toastContext'
import SocietyClaimForm from '../components/SocietyClaimForm'
import {claimPayload} from '../utils/onboardingValidation'
import {normalizeClaim} from '../utils/onboardingFormatters'
import {getCorrectionClaim,listActiveSocieties,listStudentRoles,resubmitClaim,updateClaim} from '../services/onboardingApi'
import '../student-onboarding.css'

export default function ClaimCorrectionPage(){
  const {claimId}=useParams(),navigate=useNavigate(),{notify}=useToast()
  const [claim,setClaim]=useState(null),[societies,setSocieties]=useState([]),[roles,setRoles]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saved,setSaved]=useState(false),[review,setReview]=useState(false),[sending,setSending]=useState(false)
  useEffect(()=>{Promise.all([getCorrectionClaim(claimId),listActiveSocieties(),listStudentRoles()]).then(([result,s,r])=>{setClaim(normalizeClaim(result.claim));setSocieties(s.items||s.societies||[]);setRoles((r.items||r.roles||[]).filter(x=>x.isStudentRole&&['SOCIETY','BOTH'].includes(x.scopeType)))}).catch(e=>setError(e.readableMessage)).finally(()=>setLoading(false))},[claimId])
  if(loading)return <main className="student-verification"><Skeleton lines={10}/></main>
  if(error||!claim)return <main className="student-verification"><EmptyState title="Correction unavailable" description={error||'This claim cannot be corrected.'} action={<Button onClick={()=>navigate('/student/verification')}>Back to Verification</Button>}/></main>
  const save=async()=>{try{const result=await updateClaim(claimId,claimPayload(claim));setClaim(normalizeClaim(result.claim));setSaved(true);notify('Changes saved.','success');return{claim:result.claim}}catch(e){notify(e.readableMessage,'error');return{error:e.readableMessage}}}
  const submit=async()=>{if(!saved)return;setSending(true);try{await resubmitClaim(claimId);notify('Your corrected details have been resubmitted for verification.','success');navigate('/student/verification',{replace:true})}catch(e){notify(e.readableMessage,'error')}finally{setSending(false)}}
  const societyName=claim.societyId?.name||societies.find(x=>String(x._id)===String(claim.societyId))?.name,roleName=roles.find(x=>String(x._id)===String(claim.claimedRoleId))?.name
  return <main className="student-onboarding-page"><PageContainer><PageHeader eyebrow="Claim correction" title="Correct society details" description="Only this affected claim will be updated." actions={<Button variant="ghost" icon={ArrowLeft} onClick={()=>navigate('/student/verification')}>Back</Button>}/><Card className="verification-reason"><AlertTriangle/><div><b>Changes requested</b><p>{claim.rejectionReason||'Please review the details requested by your reviewer.'}</p></div></Card>{review?<Card title="Review Correction" description="Confirm the corrected claim before resubmitting."><p><b>{societyName}</b> · {roleName}</p><p>{claim.startDate} — {claim.isOngoing?'Present':claim.endDate}</p><p>{claim.events?.length||0} event records</p><div className="claim-form-actions"><Button variant="outline" onClick={()=>setReview(false)}>Edit</Button><Button icon={Send} loading={sending} onClick={submit}>Resubmit</Button></div></Card>:<><SocietyClaimForm claim={claim} claims={[claim]} societies={societies} roles={roles} lockSociety saveLabel="Save Changes" onChange={patch=>{setClaim(x=>({...x,...patch,dirty:true}));setSaved(false)}} onSave={save}/><div className="claim-form-actions"><Button icon={Send} disabled={!saved} onClick={()=>setReview(true)}>Review Correction</Button></div></>}</PageContainer></main>
}
