import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import SupportWidget from './components/SupportWidget'
import { SiteConfigProvider } from './hooks/useSiteConfig'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <SiteConfigProvider>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
        <SupportWidget />
      </ErrorBoundary>
    </BrowserRouter>
  </SiteConfigProvider>,
)
