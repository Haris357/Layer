import type { Update } from '@tauri-apps/plugin-updater'
import { useToastStore } from '../store/toastStore'
import { downloadUpdate, applyUpdate } from './updater'
import i18n from './i18n'

function mb(bytes: number): string {
  return (bytes / 1048576).toFixed(1)
}

// Guard so the two entry points (the toast and Settings) can't kick off two
// downloads at once.
let running = false

// Installs an already-downloaded update, showing an "installing" state on the
// same toast right before the app restarts.
async function relaunchNow(u: Update, id: number): Promise<void> {
  const { update } = useToastStore.getState()
  update(id, {
    message: i18n.t('toasts.updateInstalling'),
    detail: undefined,
    actions: undefined,
    progress: undefined,
  })
  try {
    await applyUpdate(u) // installs + relaunches; the process exits from here
  } catch {
    update(id, {
      message: i18n.t('toasts.updateInstallFailed'),
      icon: 'error',
      actions: undefined,
      duration: 6000,
    })
  }
}

// Downloads an update in the background with smooth live progress on a single
// toast. The download never blocks the UI and never closes the app — when it's
// ready, the toast offers a Relaunch / Later choice so the user decides when to
// restart. On failure a dismissible error toast appears.
export async function runUpdate(u: Update): Promise<void> {
  if (running) return
  running = true
  const { showToast, update, dismiss } = useToastStore.getState()
  const id = showToast({
    message: i18n.t('toasts.updateDownloading', { version: u.version }),
    icon: 'update',
    duration: 0, // sticky while it downloads
    progress: 0,
    detail: '0%',
  })
  try {
    await downloadUpdate(u, ({ percent, downloaded, total }) => {
      update(id, {
        progress: percent,
        detail:
          total > 0
            ? `${percent}%  ·  ${mb(downloaded)} / ${mb(total)} MB`
            : `${percent}%`,
      })
    })
    running = false
    // Downloaded and ready — the user chooses when to relaunch.
    update(id, {
      message: i18n.t('toasts.updateReady', { version: u.version }),
      icon: 'success',
      progress: undefined,
      detail: undefined,
      duration: 0,
      actions: [
        {
          label: 'Relaunch',
          primary: true,
          dismiss: false,
          onClick: () => void relaunchNow(u, id),
        },
        { label: 'Later', onClick: () => {} },
      ],
    })
  } catch {
    running = false
    dismiss(id)
    showToast({
      message: i18n.t('toasts.updateFailed'),
      icon: 'error',
      duration: 6000,
    })
  }
}
