import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useClipboardStore, type NewClip } from '../store/clipboardStore'
import { isTauri } from '../lib/ipc'

// Clipboard history feed. Rust (clipboard.rs) listens for every copy the
// moment it happens and sends it here; sensitive copies (password managers)
// never arrive. This applies the user's filters and keeps the Rust side in
// sync with Pause and the Quick Paste hotkey. Mounted once in App.
export function useClipboardWatcher(): void {
  useEffect(() => {
    if (!isTauri()) return
    const un = listen<NewClip>('clipboard-changed', ({ payload }) => {
      const { settings, push } = useClipboardStore.getState()
      if (settings.paused) return
      if (payload.kind === 'image' && !settings.images) return
      if (payload.kind === 'files' && !settings.files) return
      const exe = payload.source?.exe.split(/[\\/]/).pop()?.toLowerCase()
      if (exe && settings.ignoreApps.includes(exe)) return
      push(payload)
    })

    // Keep Rust's pause / hotkey state in step with the settings.
    const sync = () => {
      const s = useClipboardStore.getState().settings
      invoke('clip_options', { paused: s.paused, hotkey: s.hotkey }).catch(() => {})
    }
    sync()
    let prev = useClipboardStore.getState().settings
    const unsub = useClipboardStore.subscribe((st) => {
      if (st.settings.paused !== prev.paused || st.settings.hotkey !== prev.hotkey) sync()
      prev = st.settings
    })

    // "Forget after N days" also applies while Layer stays open.
    useClipboardStore.getState().prune()
    const id = window.setInterval(() => useClipboardStore.getState().prune(), 60 * 60 * 1000)

    return () => {
      un.then((f) => f()).catch(() => {})
      unsub()
      window.clearInterval(id)
    }
  }, [])
}
