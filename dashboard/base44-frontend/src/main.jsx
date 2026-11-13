import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { legacyIfcViewerUrl } from '@/lib/ifcViewerUrl'

const viewerUrl = legacyIfcViewerUrl(window.location.pathname)
if (viewerUrl) window.location.replace(viewerUrl)
else ReactDOM.createRoot(document.getElementById('root')).render(<App />)
