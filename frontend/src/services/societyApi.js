import apiClient from './apiClient'

export const listSocieties = (params = {}) => apiClient.get('/societies', { params }).then((r) => r.data.data)
export const getSociety = (id) => apiClient.get(`/societies/${id}`).then((r) => r.data.data.society)
export const createSociety = (data) => apiClient.post('/societies', data).then((r) => r.data.data.society)
export const updateSociety = (id, data) => apiClient.patch(`/societies/${id}`, data).then((r) => r.data.data.society)
export const updateSocietyStatus = (id, status) => apiClient.patch(`/societies/${id}/status`, { status }).then((r) => r.data.data.society)
