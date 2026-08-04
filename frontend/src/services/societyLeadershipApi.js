import apiClient from './apiClient'

export const listLeadership = (params = {}) => apiClient.get('/society-leadership', { params }).then((r) => r.data.data)
export const getActiveLeadership = (societyId) => apiClient.get(`/society-leadership/society/${societyId}/active`).then((r) => r.data.data.leadership)
