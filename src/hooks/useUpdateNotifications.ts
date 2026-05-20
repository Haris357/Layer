import { useEffect, useRef } from 'react'
import { getAppVersion } from '../lib/ipc'
import { getUpdate } from '../lib/updater'
import { notify } from '../lib/notify'

const VERSION_KEY = 'layer-last-version'

// Fires "update installed" right after auto-update + a recurring check
// for new versions that pushes a notification when one is available.
export function useUpdateNotifications(): void {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true

    getAppVersion()
      .then((current) => {
        const last = localStorage.getItem(VERSION_KEY)
        if (last && last !== current) {
          notify({
            kind: 'update',
            title: `You're now on Layer v${current} ✦`,
            body: 'Update installed successfully.',
            dedupe: `installed-${current}`,
          })
        }
        try {
          localStorage.setItem(VERSION_KEY, current)
        } catch {
          /* ignore */
        }
      })
      .catch(() => {})

    const check = () => {
      getUpdate()
        .then((u) => {
          if (u) {
            notify({
              kind: 'update',
              title: `Layer v${u.version} is available`,
              body: 'Open Settings → Check for updates to install.',
              dedupe: `available-${u.version}`,
            })
          }
        })
        .catch(() => {})
    }
    check()
    const id = window.setInterval(check, 30 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [])
}
