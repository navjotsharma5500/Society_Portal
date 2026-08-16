import apiClient from '../../../services/apiClient'
const data=response=>response.data?.data??response.data
export const listActiveMembers=(societyId,params)=>apiClient.get(`/society-memberships/society/${societyId}/active`,{params:Object.fromEntries(Object.entries(params||{}).filter(([,value])=>value!==''&&value!==undefined&&value!==null))}).then(data)
export const countActiveMembers=societyId=>apiClient.get(`/society-memberships/society/${societyId}/active/count`).then(response=>data(response).count)
