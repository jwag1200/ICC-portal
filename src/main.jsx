import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ICCPortal from './ICCPortal.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode><ICCPortal /></StrictMode>
)