import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/titan.css'
import { legacyIfcViewerUrl } from '@/lib/ifcViewerUrl'
import { startTranslation, storedLanguage } from '@/lib/i18n'

const viewerUrl = legacyIfcViewerUrl(window.location.pathname)
if (viewerUrl) window.location.replace(viewerUrl)
else startTranslation(storedLanguage())
  .catch(() => { /* Ohne Wörterbuch bleibt die Oberfläche deutsch. */ })
  .finally(() => ReactDOM.createRoot(document.getElementById('root')).render(<App />))
