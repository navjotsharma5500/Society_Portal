import apiClient from '../../../services/apiClient'
const data=r=>r.data.data
export const listClaimApprovals=params=>apiClient.get('/society-claim-verifications/assigned-to-me',{params}).then(data)
export const claimCounts=(societyId,filters={})=>apiClient.get('/society-claim-verifications/assigned-counts',{params:{societyId,...filters}}).then(r=>data(r).counts)
export const getClaimApproval=id=>apiClient.get(`/society-claim-verifications/claims/${id}`).then(data)
export const decideClaim=(id,action,payload={})=>apiClient.post(`/society-claim-verifications/claims/${id}/${action}`,payload).then(r=>data(r).claim)
export const listJoinApprovals=params=>apiClient.get('/membership-requests/assigned-to-me',{params}).then(data)
export const joinCounts=(societyId,filters={})=>apiClient.get('/membership-requests/assigned-counts',{params:{societyId,...filters}}).then(r=>data(r).counts)
export const getJoinApproval=id=>apiClient.get(`/membership-requests/${id}`).then(r=>data(r).request)
export const decideJoin=(id,action,payload={})=>apiClient.post(`/membership-requests/${id}/${action}`,payload).then(r=>data(r).request)
