import apiClient from '../../../services/apiClient'
const unwrap=response=>response.data?.data??response.data
export const listUsers=params=>apiClient.get('/users',{params}).then(unwrap)
export const getUser=id=>apiClient.get(`/users/${id}`).then(unwrap).then(x=>x.user)
export const updateUserStatus=(id,data)=>apiClient.patch(`/users/${id}/status`,data).then(unwrap).then(x=>x.user)
export const updateUserLogin=(id,data)=>apiClient.patch(`/users/${id}/login-access`,data).then(unwrap).then(x=>x.user)
