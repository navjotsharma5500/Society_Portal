import {toDateInputValue} from '../../../utils/dateInput'
export const valueOrNA=value=>value===null||value===undefined||String(value).trim()===''?'Not available':value
export const toDateInput=toDateInputValue
export const formatDate=value=>value?new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'Not available'
export const claimTitle=(claim,societies)=>societies.find(x=>String(x._id||x.id)===String(claim.societyId))?.name||claim.society?.name||'New society claim'
export const blankEvent=()=>({localId:crypto.randomUUID(),eventName:'',startDate:'',endDate:'',description:''})
export const blankClaim=()=>({localId:crypto.randomUUID(),societyId:'',claimedRoleId:'',startDate:'',endDate:'',isOngoing:false,events:[],status:'DRAFT',dirty:true})
export const normalizeClaim=claim=>({...claim,_id:claim._id||claim.id,localId:claim._id||claim.id||crypto.randomUUID(),societyId:claim.societyId?._id||claim.societyId||claim.society?._id||'',claimedRoleId:claim.claimedRoleId?._id||claim.claimedRoleId||claim.role?._id||'',startDate:toDateInput(claim.startDate),endDate:toDateInput(claim.endDate),events:(claim.events||[]).map(event=>({...event,localId:event._id||crypto.randomUUID(),startDate:toDateInput(event.startDate),endDate:toDateInput(event.endDate)})),dirty:false})
