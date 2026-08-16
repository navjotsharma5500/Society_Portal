const clean=value=>typeof value==='string'?value.trim():''
const rawApiBaseUrl=clean(import.meta.env.VITE_API_BASE_URL)
const isValidApiBaseUrl=value=>/^https?:\/\/[^\s]+$/i.test(value)||/^\/[^/]/.test(value)
const apiBaseUrl=isValidApiBaseUrl(rawApiBaseUrl)?rawApiBaseUrl:''
const googleClientId=clean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
const GOOGLE_WEB_CLIENT_PATTERN=/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/
const isGoogleAuthConfigured=GOOGLE_WEB_CLIENT_PATTERN.test(googleClientId)
export {apiBaseUrl,googleClientId,isGoogleAuthConfigured}
