import apiClient from '../../../services/apiClient'
const data=response=>response.data?.data??response.data
export const signUpWithGoogle=idToken=>apiClient.post('/auth/google/sign-up',{idToken},{skipAuthRefresh:true}).then(data)
export const signInWithGoogle=idToken=>apiClient.post('/auth/google/sign-in',{idToken},{skipAuthRefresh:true}).then(data)
export const staffSignInWithGoogle=idToken=>apiClient.post('/auth/google/staff-sign-in',{idToken},{skipAuthRefresh:true}).then(data)
let currentUserPromise
export const getCurrentUser=({fresh=false}={})=>{if(fresh)return apiClient.get('/auth/me',{suppressExpectedError:true,headers:{'Cache-Control':'no-cache'},params:{_contextRefresh:Date.now()}}).then(data);currentUserPromise||=apiClient.get('/auth/me',{suppressExpectedError:true,headers:{'Cache-Control':'no-cache'},params:{_contextRefresh:Date.now()}}).then(data).finally(()=>{currentUserPromise=undefined});return currentUserPromise}
export const refreshSession=()=>apiClient.post('/auth/refresh',undefined,{skipAuthRefresh:true}).then(data)
export const logoutSession=()=>apiClient.post('/auth/logout',undefined,{skipAuthRefresh:true}).then(data)
