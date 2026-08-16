import {useMemo,useState} from 'react'
import {Navigate,useNavigate} from 'react-router-dom'
import {ArrowLeft,ArrowRight,Plus,Send,TriangleAlert} from 'lucide-react'
import {Button,Card,ConfirmationDialog,EmptyState,Skeleton} from '../../../design-system'
import {useToast} from '../../../components/common/toastContext'
import {useAuth} from '../../auth/hooks/useAuth'
import {resolveNextActionRoute} from '../../auth/utils/authNextAction'
import {useStudentOnboarding} from '../hooks/useStudentOnboarding'
import OnboardingHeader from '../components/OnboardingHeader'
import OnboardingStepper from '../components/OnboardingStepper'
import InstitutionalDetailsCard from '../components/InstitutionalDetailsCard'
import SocietyClaimCard from '../components/SocietyClaimCard'
import OnboardingReview from '../components/OnboardingReview'
import OnboardingSaveStatus from '../components/OnboardingSaveStatus'
import ParticipationChoice from '../components/ParticipationChoice'
import JoinSocietyForm from '../components/JoinSocietyForm'
import UndertakingAcceptance from '../components/UndertakingAcceptance'
import '../student-onboarding.css'

const editableStates=['IN_PROGRESS','CHANGES_REQUESTED','NOT_STARTED']
export default function StudentOnboardingPage(){
  const navigate=useNavigate(),{notify}=useToast(),auth=useAuth(),flow=useStudentOnboarding(),[step,setStep]=useState(1),[deleteTarget,setDeleteTarget]=useState(null),[confirmSubmit,setConfirmSubmit]=useState(false),[submitting,setSubmitting]=useState(false)
  const redirect=useMemo(()=>{if(!flow.onboarding||editableStates.includes(flow.onboarding.status))return null;if(flow.onboarding.submittedAt||['UNDER_VERIFICATION','PARTIALLY_VERIFIED','FULLY_REJECTED','LOCKED','APPROVED','COMPLETED'].includes(flow.onboarding.status))return'/student/dashboard';return resolveNextActionRoute(auth.onboarding?.nextAction)},[flow.onboarding,auth.onboarding])
  if(redirect)return <Navigate to={redirect} replace/>
  const requiredPending=flow.undertakings.some(item=>item.isMandatory&&!item.accepted),unsaved=flow.claims.some(item=>item.dirty||!item._id)
  const chooseJourney=(key,value)=>{if(!value){flow.setChoices({existing:false,join:false});return}if(key==='existing'&&flow.joinRequests.length){notify('A join request is already saved. Continue with Join a Society.','warning');return}if(key==='join'&&flow.claims.length){notify('Existing society information is already present. Remove it before switching journeys.','warning');return}flow.setChoices({existing:key==='existing',join:key==='join'});if(key==='existing'&&!flow.claims.length)flow.addClaim()}
  const continueFlow=async()=>{if(step===1&&requiredPending){notify('Accept the mandatory undertaking before continuing.','warning');return}if(step===2&&(unsaved||flow.isSaving)){notify('Save every society record before continuing.','warning');return}if(step===2&&flow.choices.join&&!flow.joinRequests.length){notify('Submit at least one society request before continuing.','warning');return}if(step===2&&!flow.claims.length&&!flow.joinRequests.length){notify('Add existing participation or submit a new membership request.','warning');return}if(step===2&&!(await flow.refreshPersisted()))return;setStep(Math.min(4,step+1));window.scrollTo({top:0,behavior:'smooth'})}
  const submit=async()=>{setSubmitting(true);const ok=await flow.submit();if(ok){notify('Your onboarding information has been submitted.','success');const refreshed=await auth.loadCurrentUser(),route=resolveNextActionRoute(refreshed?.nextAction||refreshed?.onboarding?.nextAction);navigate(route||'/student/dashboard',{replace:true})}setSubmitting(false);setConfirmSubmit(false)}
  if(flow.loading)return <main className="onboarding-page"><OnboardingHeader/><div className="onboarding-loading"><Skeleton lines={2}/><Skeleton lines={7}/></div></main>
  if(flow.loadError)return <main className="onboarding-page"><OnboardingHeader/><div className="onboarding-error"><EmptyState icon={TriangleAlert} title="Unable to load onboarding details" description={flow.loadError} action={<Button onClick={flow.retry}>Try again</Button>}/></div></main>
  return <main className="onboarding-page"><OnboardingHeader resume={flow.claims.length>0||flow.joinRequests.length>0}/><div className="onboarding-shell"><OnboardingStepper current={step} onSelect={setStep}/><section className="onboarding-content">{flow.referenceError&&<EmptyState icon={TriangleAlert} title="Some onboarding choices are unavailable" description={flow.referenceError} action={<Button onClick={flow.retry}>Try again</Button>}/>}<div className="onboarding-title-row"><div><span>Step {step} of 4</span><h1>{['Your Details & Undertaking','Society Journey','Review','Submit'][step-1]}</h1></div><OnboardingSaveStatus state={flow.saveState}/></div>
    {step===1&&<><InstitutionalDetailsCard student={flow.student||auth.student}/>{flow.undertakings.map(item=><UndertakingAcceptance key={item._id} item={item} onAccept={flow.acceptUndertaking}/>)}</>}
    {step===2&&<><ParticipationChoice existing={flow.choices.existing} join={flow.choices.join} onChange={chooseJourney}/>{flow.choices.existing&&<section><div className="step-intro"><h2>Existing Society Claims</h2><p>Add current or previous verified society participation. Events remain within their society record.</p></div>{flow.claims.map((claim,index)=><SocietyClaimCard key={claim.localId} {...{index,claim,claims:flow.claims,societies:flow.societies,roles:flow.roles}} onChange={patch=>flow.changeClaim(claim.localId,patch)} onSave={()=>flow.saveClaim(claim.localId)} onDelete={()=>setDeleteTarget(claim)}/>) }<Button variant="outline" icon={Plus} onClick={flow.addClaim}>Add Another Society</Button></section>}{flow.choices.join&&<JoinSocietyForm societies={flow.societies} requests={flow.joinRequests} activeSocietyIds={(auth.activeSocietyContexts||[]).map(item=>item.societyId)} initialOnly onSubmit={flow.submitJoinRequest}/>}</>}
    {step===3&&<><OnboardingReview student={flow.student||auth.student} claims={flow.claims} societies={flow.societies} roles={flow.roles} onEditDetails={()=>setStep(1)} onEditSocieties={()=>setStep(2)}/>{flow.joinRequests.length>0&&<Card title="New Society Join Requests" description="Submitted independently; no portal role is granted until approval.">{flow.joinRequests.map(request=><div className="review-join-request" key={request._id}><b>{request.societyId?.name||'Selected society'}</b><span>{request.status==='PENDING'?'Pending Review':request.status}</span><p>{request.requestReason}</p></div>)}<Button variant="ghost" onClick={()=>setStep(2)}>View Requests</Button></Card>}</>}
    {step===4&&<Card title="Ready to submit?" description="Saved verification claims and the new membership request remain separate."><div className="submit-panel"><Send size={24}/><h2>Submit onboarding</h2><p>Existing participation will be routed for verification. New membership requests do not grant immediate permissions.</p><Button variant="danger" icon={Send} loading={submitting} onClick={()=>setConfirmSubmit(true)}>Submit</Button></div></Card>}
    <footer className="onboarding-actions">{step>1?<Button variant="ghost" icon={ArrowLeft} onClick={()=>setStep(step-1)}>Back</Button>:<span/>}{step<4&&<Button icon={ArrowRight} onClick={continueFlow}>{step===3?'Continue to Submit':'Continue'}</Button>}</footer></section></div>
    <ConfirmationDialog open={Boolean(deleteTarget)} onClose={()=>setDeleteTarget(null)} onConfirm={async()=>{await flow.deleteDraft(deleteTarget);setDeleteTarget(null)}} danger title="Delete this society claim?" description="Only this draft claim will be removed." confirmLabel="Delete Claim"/>
    <ConfirmationDialog open={confirmSubmit} onClose={()=>setConfirmSubmit(false)} onConfirm={submit} title="Submit onboarding?" description="Saved society participation will be verified separately from any new membership request." confirmLabel="Submit"/>
  </main>
}
