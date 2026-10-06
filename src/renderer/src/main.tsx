import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { TrayPanel } from './screens/TrayPanel'

// The same bundle serves the main window and the menu bar panel (#tray).
const isTray = location.hash === '#tray'
if (isTray) document.body.classList.add('tray')

createRoot(document.getElementById('root')!).render(<StrictMode>{isTray ? <TrayPanel /> : <App />}</StrictMode>)
