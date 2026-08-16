import {GoogleOAuthProvider} from '@react-oauth/google'
import {googleClientId,isGoogleAuthConfigured} from '../../../config/environment'
export default function GoogleAuthProviderBoundary({children}){return isGoogleAuthConfigured?<GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>:children}
