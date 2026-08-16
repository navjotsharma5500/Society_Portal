import { RouterProvider } from 'react-router-dom'
import { ToastProvider } from '../components/common/ToastProvider'
import {AuthProvider} from '../modules/auth/context/AuthProvider'
import { router } from './router'
export default function App(){return <ToastProvider><AuthProvider><RouterProvider router={router}/></AuthProvider></ToastProvider>}
