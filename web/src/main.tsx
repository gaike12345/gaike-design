import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import SupportWidget from './components/SupportWidget'
import ErrorBoundary from './components/ErrorBoundary'
import { SiteConfigProvider } from './hooks/useSiteConfig'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SiteConfigProvider>
        <BrowserRouter>
          <App />
          <SupportWidget />
        </BrowserRouter>
      </SiteConfigProvider>
    </ErrorBoundary>
  </StrictMode>,
)
