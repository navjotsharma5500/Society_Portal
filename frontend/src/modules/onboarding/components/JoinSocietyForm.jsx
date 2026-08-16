import {useMemo,useState} from 'react'
import {Plus} from 'lucide-react'
import {Button,Card,Textarea} from '../../../design-system'
import SearchableSocietyCombobox from './SearchableSocietyCombobox'
import '../join-society.css'

const liveStatuses=new Set(['SUBMITTED','PENDING','ASSIGNED','CLARIFICATION_REQUESTED'])
const labels={SUBMITTED:'Pending Review',PENDING:'Pending Review',ASSIGNED:'Under Review',APPROVED:'Approved',REJECTED:'Not Approved',CLARIFICATION_REQUESTED:'More Information Required',CANCELLED:'Cancelled',EXPIRED:'Expired'}
const societyId=request=>String(request.societyId?._id||request.societyId||'')

function RequestCard({request}){return <article className="join-request-card"><header><b>{request.societyId?.name||'Society request'}</b><span>{labels[request.status]||request.status}</span></header><small>Request submitted</small><p><b>Reason:</b> {request.requestReason}</p>{request.decisionReason&&<p><b>Reviewer response:</b> {request.decisionReason}</p>}</article>}

export default function JoinSocietyForm({societies,requests,activeSocietyIds=[],initialOnly=false,onSubmit}){
  const[society,setSociety]=useState(''),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[adding,setAdding]=useState(requests.length===0)
  const blocked=useMemo(()=>new Set([...activeSocietyIds.map(String),...requests.filter(item=>liveStatuses.has(item.status)||item.status==='APPROVED').map(societyId)]),[activeSocietyIds,requests])
  const available=useMemo(()=>societies.filter(item=>!blocked.has(String(item._id||item.id))),[societies,blocked])
  const submit=async()=>{if(!society||!reason.trim()){setError('Select a society and provide a short reason.');return}setSaving(true);setError('');const result=await onSubmit({societyId:society,requestReason:reason.trim()});if(result.ok){setSociety('');setReason('');setAdding(false)}else setError(result.message);setSaving(false)}
  return <Card title="Join a Society" description="Each society request is submitted and reviewed independently."><div className="join-society-form">{requests.length>0&&<section className="join-request-list" aria-label="Your Society Requests"><h4>Your Society Requests</h4>{requests.map(request=><RequestCard key={request._id} request={request}/>)}</section>}{adding&&<div className="join-request-editor"><SearchableSocietyCombobox societies={available} value={society} onChange={setSociety}/><Textarea label="Why do you want to join?" value={reason} maxLength={2000} onChange={event=>setReason(event.target.value)}/>{error&&<p role="alert" className="claim-error-summary">{error}</p>}<Button loading={saving} onClick={submit}>Submit Membership Request</Button></div>}{!adding&&!initialOnly&&<Button variant="outline" icon={Plus} onClick={()=>setAdding(true)}>Add Another Society</Button>}</div></Card>
}
