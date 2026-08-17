import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './amplifyConfig'
import App from './App.tsx'
import { reportWebVitals } from './lib/reportWebVitals'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

reportWebVitals()
