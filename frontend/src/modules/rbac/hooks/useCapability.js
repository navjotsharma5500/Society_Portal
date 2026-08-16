import {useAuth} from '../../auth/hooks/useAuth'
import {hasCapability} from '../utils/permissions'
export function useCapability(){const auth=useAuth();return code=>hasCapability(auth,code)}
