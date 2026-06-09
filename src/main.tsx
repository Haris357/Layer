import React from 'react'
import ReactDOM from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App'
import './index.css'

async function boot() {
  const el = document.getElementById('root')
  if (!el) return

  // The Layer Dock is a separate window (label "notch") — render its own
  // isolated root so NONE of the desktop App hooks run there. Check the label
  // FIRST (the dock process reports normal launch mode, so this must come
  // before the screensaver check below).
  let label = ''
  try {
    label = getCurrentWindow().label
  } catch {
    /* not in Tauri */
  }
  if (label === 'notch') {
    const { DockRoot } = await import('./dock/DockRoot')
    ReactDOM.createRoot(el).render(<DockRoot />)
    return
  }

  // Ask Rust how we were launched. When Windows runs us as a screensaver we
  // render the calm ambient view instead of the desktop canvas — and load it
  // lazily so none of the app's hooks run in that mode.
  let mode = 'normal'
  try {
    mode = await invoke<string>('get_launch_mode')
  } catch {
    /* not in Tauri (e.g. plain browser) — fall back to the app */
  }

  const root = ReactDOM.createRoot(el)
  if (mode === 'screensaver') {
    const { Screensaver } = await import('./screensaver/Screensaver')
    root.render(<Screensaver />)
  } else {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  }
}

boot()
