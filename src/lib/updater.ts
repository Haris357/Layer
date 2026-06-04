import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { IS_STORE } from './dist'

// Returns the pending update, or null when already up to date. Store builds
// never self-update — the Microsoft Store delivers updates — so this is a
// no-op there (disables update toasts and the Settings check alike).
export async function getUpdate(): Promise<Update | null> {
  if (IS_STORE) return null
  return await check()
}

export interface DownloadProgress {
  percent: number
  downloaded: number
  total: number
}

// Downloads the update in the background (does NOT install or close the app),
// reporting byte-level progress. The app keeps running normally.
export async function downloadUpdate(
  update: Update,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  let downloaded = 0
  let total = 0
  await update.download((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? 0
        onProgress?.({ percent: 0, downloaded: 0, total })
        break
      case 'Progress':
        downloaded += event.data.chunkLength
        onProgress?.({
          percent:
            total > 0
              ? Math.min(100, Math.round((downloaded / total) * 100))
              : 0,
          downloaded,
          total,
        })
        break
      case 'Finished':
        onProgress?.({ percent: 100, downloaded: total, total })
        break
    }
  })
}

// Installs an already-downloaded update and relaunches onto the new version.
// This is the only step that closes the app — call it when the user opts in.
export async function applyUpdate(update: Update): Promise<void> {
  await update.install()
  await relaunch()
}
