import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Note: StrictMode is intentionally omitted — its dev-only double mount/unmount
// would initialise the PIXI/WebGL context twice. The engine is cleaned up
// explicitly on unmount instead.
createRoot(document.getElementById('root')!).render(<App />)
