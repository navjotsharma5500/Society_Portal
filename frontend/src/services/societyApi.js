import apiClient from './apiClient'

export const listSocieties = (params = {}) => apiClient.get('/societies', { params }).then((r) => r.data.data)
export const getSociety = (id) => apiClient.get(`/societies/${id}`).then((r) => r.data.data.society)
export const getSocietyTeam = (id, params = {}) => apiClient.get(`/societies/${id}/team`, { params }).then((r) => r.data.data)
export const getTeamRoles=id=>apiClient.get(`/societies/${id}/team/roles`).then(r=>r.data.data.items)
export const searchTeamPeople=(id,search)=>apiClient.get(`/societies/${id}/team/people`,{params:{search}}).then(r=>r.data.data.items)
export const assignTeamRole=(id,payload)=>apiClient.post(`/societies/${id}/team/assign`,payload).then(r=>r.data.data.assignment)
export const endTeamTenure=(id,assignmentId,remarks)=>apiClient.patch(`/societies/${id}/team/assignments/${assignmentId}/end`,{remarks}).then(r=>r.data.data.assignment)
export const downloadTeamTemplate=id=>apiClient.get(`/societies/${id}/team/import/template`,{responseType:'blob'}).then(r=>r.data)
export const previewTeamImport=(id,file)=>{const body=new FormData();body.append('file',file);return apiClient.post(`/societies/${id}/team/import/preview`,body).then(r=>r.data.data)}
export const confirmTeamImport=(id,sessionId)=>apiClient.post(`/societies/${id}/team/import/${sessionId}/confirm`).then(r=>r.data.data)
export const createSociety = (data) => apiClient.post('/societies', data).then((r) => r.data.data.society)
export const updateSociety = (id, data) => apiClient.patch(`/societies/${id}`, data).then((r) => r.data.data.society)
export const updateSocietyStatus = (id, status) => apiClient.patch(`/societies/${id}/status`, { status }).then((r) => r.data.data.society)
