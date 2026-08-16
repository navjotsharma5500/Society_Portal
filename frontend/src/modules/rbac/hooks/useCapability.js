import {useAuth} from '../../auth/hooks/useAuth'
import {useCallback} from 'react'
import {hasCapability} from '../utils/permissions'
export function useCapability(){const auth=useAuth();return useCallback(code=>hasCapability(auth,code),[auth])}
