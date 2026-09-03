import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import SupportWidget from './components/SupportWidget'
import { SiteConfigProvider } from './hooks/useSiteConfig'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteConfigProvider>
      <BrowserRouter>
        <App />
        <SupportWidget />
      </BrowserRouter>
    </SiteConfigProvider>
  </StrictMode>,
)
