import axios from 'axios'
import {apiBaseUrl} from '../config/environment'

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
  withCredentials: true,
})

let refreshPromise = null
let terminalAuthFailure = false

const compactParams=params=>params&&Object.fromEntries(Object.entries(params).filter(([,value])=>value!==''&&value!==null&&value!==undefined))
apiClient.interceptors.request.use(config=>({...config,params:compactParams(config.params)}))

apiClient.interceptors.response.use(
  (response) => {
    if (/\/auth\/(google|refresh)/.test(response.config?.url||'')) terminalAuthFailure=false
    return response
  },
  async (error) => {
    const original = error.config || {}
    const isUnauthorized = error.response?.status === 401
    const responseCode = error.response?.data?.error?.code
    const accessDisabled=['LOGIN_ACCESS_DISABLED','ACCOUNT_INACTIVE','ACCOUNT_SUSPENDED','STUDENT_RECORD_INACTIVE'].includes(responseCode)
    const isAuthMutation = /\/auth\/(google|refresh|logout)/.test(original.url || '')
    const isKnownGuest = /\/auth\/me$/.test(original.url || '') && responseCode === 'AUTHENTICATION_REQUIRED'
    if(accessDisabled&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('auth:access-disabled',{detail:{code:responseCode}}))
    if (isUnauthorized && terminalAuthFailure) {
      error.readableMessage='Your session has expired. Please sign in again.'
      error.errorCode='AUTHENTICATION_REQUIRED'
      return Promise.reject(error)
    }
    if (isUnauthorized && !isKnownGuest && !original._authRetry && !original.skipAuthRefresh && !isAuthMutation) {
      original._authRetry = true
      try {
        refreshPromise ||= axios.post(`${apiBaseUrl}/auth/refresh`, undefined, {withCredentials:true, timeout:15000,skipAuthRefresh:true}).catch(refreshError=>{terminalAuthFailure=true;if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('auth:session-expired',{detail:{path:window.location.pathname}}));throw refreshError}).finally(() => { refreshPromise = null })
        await refreshPromise
        return apiClient(original)
      } catch (refreshError) {
        error = refreshError
      }
    }
    const backendError = error.response?.data?.error
    error.readableMessage = backendError?.message || (error.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : 'Unable to complete the request. Check your connection and try again.')
    error.errorCode = backendError?.code || 'REQUEST_FAILED'
    return Promise.reject(error)
  },
)

export default apiClient
export {compactParams}
