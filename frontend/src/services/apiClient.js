import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const backendError = error.response?.data?.error
    error.readableMessage = backendError?.message || (error.code === 'ECONNABORTED'
      ? 'The request timed out. Please try again.'
      : 'Unable to complete the request. Check your connection and try again.')
    error.errorCode = backendError?.code || 'REQUEST_FAILED'
    return Promise.reject(error)
  },
)

export default apiClient
