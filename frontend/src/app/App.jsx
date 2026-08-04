import { RouterProvider } from 'react-router-dom'
import { ToastProvider } from '../components/common/ToastProvider'
import { router } from './router'
export default function App(){return <ToastProvider><RouterProvider router={router}/></ToastProvider>}
