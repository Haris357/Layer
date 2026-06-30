import { useEffect, useRef } from 'react'
import { getAppVersion } from '../lib/ipc'
import { getUpdate } from '../lib/updater'
import { runUpdate } from '../lib/updateFlow'
import { useToastStore } from '../store/toastStore'
import { notify } from '../lib/notify'
import i18n from '../lib/i18n'

const VERSION_KEY = 'layer-last-version'
const TOAST_KEY = 'layer-update-toast'

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
            title: i18n.t('notify.updatedTitle', { version: current }),
            body: i18n.t('notify.updatedBody'),
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
          if (!u) return
          // Keep a record in the notifications panel…
          notify({
            kind: 'update',
            title: i18n.t('notify.availableTitle', { version: u.version }),
            body: i18n.t('notify.availableBody'),
            dedupe: `available-${u.version}`,
          })
          // …and surface a one-tap toast — but only once per version so it
          // never nags on the recurring check.
          if (localStorage.getItem(TOAST_KEY) !== u.version) {
            try {
              localStorage.setItem(TOAST_KEY, u.version)
            } catch {
              /* ignore */
            }
            useToastStore.getState().showToast({
              message: i18n.t('toasts.updateAvailable', { version: u.version }),
              icon: 'update',
              actions: [
                { label: 'Update now', primary: true, onClick: () => runUpdate(u) },
              ],
              duration: 12000,
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
