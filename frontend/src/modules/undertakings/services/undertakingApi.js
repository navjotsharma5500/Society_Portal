import apiClient from '../../../services/apiClient'
const unwrap=response=>response.data?.data??response.data
export const listUndertakings=()=>apiClient.get('/undertakings').then(unwrap)
export const createUndertaking=data=>apiClient.post('/undertakings',data).then(unwrap)
export const updateUndertaking=(id,data)=>apiClient.patch(`/undertakings/${id}`,data).then(unwrap)
export const activateUndertaking=id=>apiClient.post(`/undertakings/${id}/activate`).then(unwrap)
export const deactivateUndertaking=id=>apiClient.post(`/undertakings/${id}/deactivate`).then(unwrap)
export const requiredUndertakings=scope=>apiClient.get('/undertakings/required',{params:{scope}}).then(unwrap)
export const acceptUndertaking=(id,scope)=>apiClient.post(`/undertakings/${id}/accept`,{scope}).then(unwrap)
