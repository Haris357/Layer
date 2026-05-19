import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

// Returns the pending update, or null when already up to date.
export async function getUpdate(): Promise<Update | null> {
  return await check()
}

// Downloads + installs an update, reporting download progress (0-100),
// then relaunches the app on the new version.
export async function installUpdate(
  update: Update,
  onProgress?: (percent: number) => void,
): Promise<void> {
  let downloaded = 0
  let total = 0
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? 0
        break
      case 'Progress':
        downloaded += event.data.chunkLength
        if (total > 0) {
          onProgress?.(Math.min(100, Math.round((downloaded / total) * 100)))
        }
        break
      case 'Finished':
        onProgress?.(100)
        break
    }
  })
  await relaunch()
}
