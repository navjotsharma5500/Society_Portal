import apiClient from './apiClient'

export const listLeadership = (params = {}) => apiClient.get('/society-leadership', { params }).then((r) => r.data.data)
export const getActiveLeadership = (societyId) => apiClient.get(`/society-leadership/society/${societyId}/active`).then((r) => r.data.data.leadership)
export const createLeadership=payload=>apiClient.post('/society-leadership',payload).then(r=>r.data.data.leadership)
export const endLeadership=(id,payload)=>apiClient.patch(`/society-leadership/${id}/end`,payload).then(r=>r.data.data.leadership)
export const downloadLeadershipTemplate=()=>apiClient.get('/society-leadership/import/template',{responseType:'blob'}).then(r=>r.data)
export const previewLeadershipImport=file=>{const body=new FormData();body.append('file',file);return apiClient.post('/society-leadership/import/preview',body).then(r=>r.data.data)}
export const confirmLeadershipImport=id=>apiClient.post(`/society-leadership/import/${id}/confirm`).then(r=>r.data.data)
