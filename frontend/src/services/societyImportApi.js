import apiClient from './apiClient'

export const previewImport = (file, academicSession) => {
  const body = new FormData()
  body.append('file', file)
  body.append('academicSession', academicSession)
  return apiClient.post('/society-imports/preview', body).then((r) => r.data.data)
}
export const confirmImport = (id) => apiClient.post(`/society-imports/${id}/confirm`).then((r) => r.data.data)
export const getImportSession = (id) => apiClient.get(`/society-imports/${id}`).then((r) => r.data.data)
export const downloadTemplate = async () => {
  const response = await apiClient.get('/society-imports/template', { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = 'TIET-Society-Import-Template.xlsx'
  link.click()
  URL.revokeObjectURL(url)
}
