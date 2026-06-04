import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { Space, SpacesFile, Widget } from '../types/widget'

// What sanitizeForSync removes before anything leaves the device. Kept as a
// constant so it can be asserted in tests and shown to the user if needed.
export const STRIP_REPORT = [
  'sticky.text',
  'todo.items[].text',
  'apps.pinned',
  'image.src',
  'video.src',
  'gallery.sources',
  'note.activeEntryId',
] as const

// Blank the private/local content on a single widget (mutates the clone).
function stripWidget(w: Widget): void {
  switch (w.type) {
    case 'sticky':
      w.text = ''
      break
    case 'todo':
      w.items = w.items.map((it) => ({ ...it, text: '' }))
      break
    case 'apps':
      w.pinned = []
      break
    case 'image':
      w.src = ''
      break
    case 'video':
      w.src = ''
      break
    case 'gallery':
      w.sources = []
      break
    case 'note':
      // The journal text lives in journal.json (never synced); the active
      // entry id would dangle on another device.
      w.activeEntryId = null
      break
    default:
      break
  }
}

// Produce a cloud-safe copy: layout, sizes, colours, appearance and benign
// config are kept; private/local content is blanked. Never mutates the input.
export function sanitizeForSync(file: SpacesFile): SpacesFile {
  const clone: SpacesFile = structuredClone(file)
  for (const space of clone.templates) {
    for (const w of space.widgets) stripWidget(w)
  }
  return clone
}

export interface RemoteState {
  spaces: SpacesFile
  savedAtClient: string
  deviceId: string
}

function stateRef(uid: string) {
  return doc(db, 'users', uid, 'sync', 'state')
}

// Upload the sanitized layout for this user. Returns the savedAt we wrote so
// the caller can record lastSyncedAt.
export async function uploadState(
  uid: string,
  file: SpacesFile,
  deviceId: string,
): Promise<string> {
  const clean = sanitizeForSync(file)
  await setDoc(stateRef(uid), {
    spaces: clean,
    savedAtClient: clean.savedAt,
    updatedAt: serverTimestamp(),
    deviceId,
    version: 1,
  })
  return clean.savedAt
}

export async function fetchState(uid: string): Promise<RemoteState | null> {
  const snap = await getDoc(stateRef(uid))
  if (!snap.exists()) return null
  const d = snap.data() as {
    spaces?: SpacesFile
    savedAtClient?: string
    deviceId?: string
  }
  if (!d.spaces || !Array.isArray(d.spaces.templates)) return null
  return {
    spaces: d.spaces,
    savedAtClient: d.savedAtClient ?? d.spaces.savedAt ?? '',
    deviceId: d.deviceId ?? '',
  }
}

// Re-attach the private fields we stripped before upload, by widget id, so a
// pull never wipes local-only content. Widgets that only exist remotely keep
// their blanked fields (there's no local source for them).
function reinjectPrivate(remote: Widget, local: Widget | undefined): Widget {
  if (!local || local.type !== remote.type) return remote
  switch (remote.type) {
    case 'sticky':
      if (local.type === 'sticky') remote.text = local.text
      break
    case 'todo':
      if (local.type === 'todo') {
        const byId = new Map(local.items.map((it) => [it.id, it.text]))
        remote.items = remote.items.map((it) =>
          byId.has(it.id) ? { ...it, text: byId.get(it.id) ?? it.text } : it,
        )
      }
      break
    case 'apps':
      if (local.type === 'apps') remote.pinned = local.pinned
      break
    case 'image':
      if (local.type === 'image') remote.src = local.src
      break
    case 'video':
      if (local.type === 'video') remote.src = local.src
      break
    case 'gallery':
      if (local.type === 'gallery') remote.sources = local.sources
      break
    case 'note':
      if (local.type === 'note') remote.activeEntryId = local.activeEntryId
      break
    default:
      break
  }
  return remote
}

// Build the spaces to hydrate when restoring from the cloud, preserving local
// private content found by widget id.
export function mergeRestore(
  remote: SpacesFile,
  localSpaces: Space[],
): { spaces: Space[]; activeId: string } {
  const localById = new Map<string, Widget>()
  for (const s of localSpaces) {
    for (const w of s.widgets) localById.set(w.id, w)
  }
  const spaces = structuredClone(remote.templates).map((space) => ({
    ...space,
    widgets: space.widgets.map((w) => reinjectPrivate(w, localById.get(w.id))),
  }))
  return { spaces, activeId: remote.activeId }
}
