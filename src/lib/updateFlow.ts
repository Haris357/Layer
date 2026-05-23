import type { Update } from '@tauri-apps/plugin-updater'
import { useToastStore } from '../store/toastStore'
import { installUpdate } from './updater'

// Downloads + installs an update, showing live progress in a sticky toast.
// On success the app relaunches; on failure a dismissible error toast shows.
export async function runUpdate(u: Update): Promise<void> {
  const { showToast, update, dismiss } = useToastStore.getState()
  const id = showToast({
    message: `Downloading Layer v${u.version}…`,
    icon: 'update',
    duration: 0, // sticky while it downloads
    progress: 0,
  })
  try {
    await installUpdate(u, (p) =>
      update(id, {
        message: `Downloading Layer v${u.version}… ${p}%`,
        progress: p,
      }),
    )
    update(id, { message: 'Installing — Layer will restart…', progress: 100 })
  } catch {
    dismiss(id)
    showToast({
      message: 'Update failed — try Settings → Check for updates.',
      icon: 'error',
      duration: 5000,
    })
  }
}
