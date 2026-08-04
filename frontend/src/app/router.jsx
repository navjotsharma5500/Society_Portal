import { createBrowserRouter, Navigate } from 'react-router-dom'
import SuperAdminLayout from '../layouts/SuperAdminLayout'
import SuperAdminHomePage from '../modules/dashboard/pages/SuperAdminHomePage'
import SocietyManagementPage from '../modules/societies/pages/SocietyManagementPage'
import SocietyDetailsPage from '../modules/societies/pages/SocietyDetailsPage'
import NotFoundPage from '../components/common/NotFoundPage'
export const router=createBrowserRouter([{path:'/',element:<Navigate to="/admin" replace/>},{path:'/admin',element:<SuperAdminLayout/>,children:[{index:true,element:<SuperAdminHomePage/>},{path:'societies',element:<SocietyManagementPage/>},{path:'societies/:societyId',element:<SocietyDetailsPage/>}]},{path:'*',element:<NotFoundPage/>}])
