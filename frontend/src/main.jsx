import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './styles/globals.css'
import './styles/components.css'
import './styles/layout.css'
import App from './app/App.jsx'
import GoogleAuthProviderBoundary from './modules/auth/components/GoogleAuthProviderBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <GoogleAuthProviderBoundary>
    <StrictMode>
      <App />
    </StrictMode>
  </GoogleAuthProviderBoundary>,
)
