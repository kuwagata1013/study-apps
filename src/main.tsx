import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import OfflineBadge from './offline/OfflineBadge.tsx'

// オフライン版（npm run build:offline）のときだけ「オフライン版」表示を出す
const isOffline = import.meta.env.MODE === 'offline'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {isOffline && <OfflineBadge />}
  </StrictMode>,
)
