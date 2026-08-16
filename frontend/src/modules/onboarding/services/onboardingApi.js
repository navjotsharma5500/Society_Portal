import apiClient from '../../../services/apiClient'
const unwrap=response=>response.data?.data??response.data
let initializationPromise
export const getOnboarding=()=>apiClient.get('/student-onboarding/me',{skipAuthRefresh:false,suppressExpectedError:true}).then(unwrap)
export const startOnboarding=()=>apiClient.post('/student-onboarding/start').then(unwrap)
export const initializeOnboarding=()=>{if(!initializationPromise)initializationPromise=getOnboarding().catch(error=>{if(error?.errorCode==='ONBOARDING_NOT_FOUND')return startOnboarding().then(()=>getOnboarding());throw error}).finally(()=>{initializationPromise=undefined});return initializationPromise}
export const getOnboardingProgress=()=>apiClient.get('/student-onboarding/me/progress').then(unwrap)
export const updateOnboarding=data=>apiClient.patch('/student-onboarding/me',data).then(unwrap)
export const createClaim=data=>apiClient.post('/student-onboarding/me/claims',data).then(unwrap)
export const getCorrectionClaim=claimId=>apiClient.get(`/student-onboarding/me/claims/${claimId}`).then(unwrap)
export const updateClaim=(claimId,data)=>apiClient.patch(`/student-onboarding/me/claims/${claimId}`,data).then(unwrap)
export const deleteClaim=claimId=>apiClient.delete(`/student-onboarding/me/claims/${claimId}`).then(unwrap)
export const submitOnboarding=mode=>apiClient.post('/student-onboarding/me/submit',{mode}).then(unwrap)
export const resubmitClaim=claimId=>apiClient.post(`/student-onboarding/me/claims/${claimId}/resubmit`).then(unwrap)
export const resubmitMembershipRequest=(id,data)=>apiClient.post(`/membership-requests/${id}/resubmit`,data).then(unwrap)
let referencesPromise,referencesExpiresAt=0
export const getOnboardingReferences=()=>{
  const now=Date.now()
  if(!referencesPromise||now>=referencesExpiresAt){
    referencesExpiresAt=now+1000
    referencesPromise=apiClient.get('/student-onboarding/references').then(unwrap).catch(error=>{referencesPromise=undefined;referencesExpiresAt=0;throw error})
  }
  return referencesPromise
}
export const listActiveSocieties=()=>getOnboardingReferences().then(data=>({items:data.societies||[]}))
export const listStudentRoles=()=>getOnboardingReferences().then(data=>({items:data.roles||[]}))
export const getRequiredUndertakings=scope=>apiClient.get('/undertakings/required',{params:{scope}}).then(unwrap)
export const acceptUndertaking=(id,scope)=>apiClient.post(`/undertakings/${id}/accept`,{scope}).then(unwrap)
export const createMembershipRequest=data=>apiClient.post('/membership-requests',data).then(unwrap)
export const listMyMembershipRequests=()=>apiClient.get('/membership-requests/me',{params:{page:1,limit:50}}).then(unwrap)
export const getMembershipRequest=id=>apiClient.get(`/membership-requests/${id}`).then(unwrap)
export const listMyMemberships=()=>apiClient.get('/society-memberships/me',{params:{page:1,limit:50}}).then(unwrap)

let pageLoadPromise,pageLoadExpiresAt=0
export const loadOnboardingPage=(force=false)=>{
  const now=Date.now()
  if(force||!pageLoadPromise||now>=pageLoadExpiresAt){
    pageLoadExpiresAt=now+1000
    pageLoadPromise=initializeOnboarding().then(base=>Promise.allSettled([
      getOnboardingProgress(),getOnboardingReferences(),getRequiredUndertakings('SIGNUP'),listMyMembershipRequests(),
    ]).then(results=>({base,results}))).catch(error=>{pageLoadPromise=undefined;pageLoadExpiresAt=0;throw error})
  }
  return pageLoadPromise
}
