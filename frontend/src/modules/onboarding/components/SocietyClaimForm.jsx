import {useState} from 'react'
import {Button,Input,Select,Switch} from '../../../design-system'
import {validateClaim} from '../utils/onboardingValidation'
import EventParticipationList from './EventParticipationList'
import SearchableSocietyCombobox from './SearchableSocietyCombobox'

export default function SocietyClaimForm({claim,claims,societies,roles,onChange,onSave,lockSociety=false,saveLabel='Save Society'}){
  const[errors,setErrors]=useState({}),hasSociety=Boolean(claim.societyId),hasRole=Boolean(claim.claimedRoleId),hasStart=Boolean(claim.startDate),durationComplete=Boolean(claim.isOngoing||claim.endDate&&claim.endDate>=claim.startDate),excluded=claims.filter(item=>item.localId!==claim.localId).map(item=>String(item.societyId))
  const save=async()=>{const next=validateClaim(claim,claims);setErrors(next);if(Object.keys(next).length)return;const result=await onSave();if(result?.errors)setErrors(result.errors)}
  return <div className="claim-form"><div className="onboarding-form-grid">
    <div className={lockSociety?'field-locked':''}><SearchableSocietyCombobox societies={societies} value={claim.societyId} excluded={excluded} error={errors.societyId} onChange={societyId=>{if(!lockSociety)onChange({societyId,claimedRoleId:'',startDate:'',endDate:'',isOngoing:false,events:[]})}}/>{lockSociety&&<small>Society is locked for this correction.</small>}</div>
    <Select label="Role" disabled={!hasSociety} value={claim.claimedRoleId} onChange={event=>onChange({claimedRoleId:event.target.value,startDate:'',endDate:'',isOngoing:false})} error={errors.claimedRoleId} options={[{value:'',label:'Select a student role'},...roles.map(role=>({value:role._id||role.id,label:`${role.name}${role.category?` · ${role.category}`:''}`}))]}/>
    <Input label="Start Date" disabled={!hasRole} type="date" value={claim.startDate} onChange={event=>onChange({startDate:event.target.value,endDate:'',isOngoing:false,events:[]})} error={errors.startDate}/>
    <div><Input label={claim.isOngoing?'End Date · Present':'End Date'} disabled={!hasStart||claim.isOngoing} type="date" value={claim.endDate} onChange={event=>onChange({endDate:event.target.value})} error={errors.endDate}/><div className="ongoing-field"><Switch label="Ongoing" disabled={!hasStart} checked={claim.isOngoing} onChange={event=>onChange({isOngoing:event.target.checked,endDate:event.target.checked?'':claim.endDate})}/>{claim.isOngoing&&<span>Present</span>}</div></div>
  </div>{durationComplete&&<EventParticipationList events={claim.events||[]} errors={errors.events} onChange={events=>onChange({events})}/>} {Object.keys(errors).length>0&&<p className="claim-error-summary" role="alert">Please correct the highlighted fields before saving this society.</p>}<div className="claim-form-actions"><Button type="button" disabled={!durationComplete} onClick={save}>{saveLabel}</Button></div></div>
}
