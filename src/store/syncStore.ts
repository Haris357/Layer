import { create } from 'zustand'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut as fbSignOut,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { fetchState, mergeRestore, uploadState } from '../lib/sync'
import { useCanvasStore } from './canvasStore'
import { useSettingsStore } from './settingsStore'
import { isTauri } from '../lib/ipc'
import { uid as randomId } from '../lib/utils'
import type { SpacesFile } from '../types/widget'

const EMAIL_API =
  (import.meta.env.VITE_EMAIL_API_URL as string | undefined) ||
  'https://layer-web-eta.vercel.app'

type Status = 'idle' | 'sending' | 'verifying' | 'syncing' | 'error'

interface SyncState {
  signedIn: boolean
  uid: string | null
  email: string | null
  status: Status
  error: string | null
  pendingEmail: string | null
  lastSyncedAt: string | null
  initialized: boolean
  init: () => void
  requestOtp: (email: string) => Promise<boolean>
  verifyOtp: (code: string) => Promise<boolean>
  signOut: () => Promise<void>
  syncNow: () => Promise<void>
  restoreFromCloud: () => Promise<void>
}

// Friendly messages for the error codes the backend returns.
const ERRORS: Record<string, string> = {
  format: 'That email doesn’t look right.',
  undeliverable: 'That email can’t receive mail — check the address.',
  rate_limited: 'Too many codes requested. Try again later.',
  cooldown: 'Please wait a moment before requesting another code.',
  expired: 'That code expired. Request a new one.',
  too_many_attempts: 'Too many tries. Request a new code.',
  invalid: 'That code isn’t right.',
}

async function postJson(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const url = `${EMAIL_API}${path}`
  const opts: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
  // Use the Tauri HTTP plugin in the app (bypasses webview CORS); fall back to
  // window.fetch in a plain browser (dev).
  const res = isTauri()
    ? await tauriFetch(url, opts)
    : await fetch(url, opts)
  let data: Record<string, unknown> = {}
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    /* ignore non-JSON */
  }
  return { ok: res.ok, status: res.status, data }
}

// Assemble the current on-disk SpacesFile shape from the canvas store (mirrors
// usePersistence's save payload).
function currentSpacesFile(): SpacesFile {
  const { widgets, spaces, activeId } = useCanvasStore.getState()
  const synced = spaces.map((t) =>
    t.id === activeId ? { ...t, widgets } : t,
  )
  return {
    version: 1,
    templates: synced,
    activeId,
    savedAt: new Date().toISOString(),
  }
}

function ensureDeviceId(): string {
  const s = useSettingsStore.getState()
  if (s.deviceId) return s.deviceId
  const id = randomId()
  s.setDeviceId(id)
  return id
}

export const useSyncStore = create<SyncState>((set, get) => ({
  signedIn: false,
  uid: null,
  email: null,
  status: 'idle',
  error: null,
  pendingEmail: null,
  lastSyncedAt: useSettingsStore.getState().lastSyncedAt,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    onAuthStateChanged(auth, (user) => {
      if (user) {
        const email =
          (user.email as string | null) ||
          useSettingsStore.getState().syncEmail
        set({ signedIn: true, uid: user.uid, email })
        // Reconcile with the cloud on sign-in / persisted-session restore.
        // pullOnSignIn has its own lock, so this is safe alongside verifyOtp.
        void pullOnSignIn()
      } else {
        set({ signedIn: false, uid: null, email: null })
      }
    })
  },

  requestOtp: async (email) => {
    set({ status: 'sending', error: null })
    try {
      const { ok, data } = await postJson('/api/send-otp', { email })
      if (!ok) {
        const reason = (data.reason || data.error) as string
        set({ status: 'error', error: ERRORS[reason] || 'Could not send code.' })
        return false
      }
      set({ status: 'idle', pendingEmail: email, error: null })
      return true
    } catch {
      set({ status: 'error', error: 'Network error. Try again.' })
      return false
    }
  },

  verifyOtp: async (code) => {
    const email = get().pendingEmail
    if (!email) {
      set({ status: 'error', error: 'Request a code first.' })
      return false
    }
    set({ status: 'verifying', error: null })
    try {
      const { ok, data } = await postJson('/api/verify-otp', { email, code })
      if (!ok || !data.token) {
        const reason = (data.error as string) || 'invalid'
        set({ status: 'error', error: ERRORS[reason] || 'Could not verify.' })
        return false
      }
      await signInWithCustomToken(auth, data.token as string)
      const settings = useSettingsStore.getState()
      settings.setSyncEmail(email)
      settings.setCloudSyncEnabled(true)
      set({ status: 'idle', pendingEmail: null, email, error: null })
      await pullOnSignIn()
      return true
    } catch {
      set({ status: 'error', error: 'Could not sign in. Try again.' })
      return false
    }
  },

  signOut: async () => {
    try {
      await fbSignOut(auth)
    } catch {
      /* ignore */
    }
    useSettingsStore.getState().setCloudSyncEnabled(false)
    set({ signedIn: false, uid: null, email: null, status: 'idle' })
  },

  syncNow: async () => {
    const { uid } = get()
    const { hydrated } = useCanvasStore.getState()
    if (!uid || !hydrated) return
    set({ status: 'syncing', error: null })
    try {
      const savedAt = await uploadState(
        uid,
        currentSpacesFile(),
        ensureDeviceId(),
      )
      useSettingsStore.getState().setLastSyncedAt(savedAt)
      set({ status: 'idle', lastSyncedAt: savedAt })
    } catch {
      set({ status: 'error', error: 'Sync failed. Will retry.' })
    }
  },

  restoreFromCloud: async () => {
    const { uid } = get()
    if (!uid) return
    set({ status: 'syncing', error: null })
    try {
      const remote = await fetchState(uid)
      if (!remote) {
        set({ status: 'idle' })
        return
      }
      const { spaces } = useCanvasStore.getState()
      const merged = mergeRestore(remote.spaces, spaces)
      useCanvasStore.getState().hydrateSpaces(merged.spaces, merged.activeId)
      const now = new Date().toISOString()
      useSettingsStore.getState().setLastSyncedAt(now)
      set({ status: 'idle', lastSyncedAt: now })
    } catch {
      set({ status: 'error', error: 'Could not restore from cloud.' })
    }
  },
}))

// First-sign-in / launch reconciliation: empty cloud → push local; otherwise
// last-write-wins by client savedAt (cloud wins on ties since the user just
// opted in). Waits for the canvas to hydrate so we never upload empty data.
// A lock keeps the auth-listener and verifyOtp calls from overlapping.
let pulling = false
async function pullOnSignIn(): Promise<void> {
  if (pulling) return
  const { uid } = useSyncStore.getState()
  if (!uid) return
  pulling = true
  try {
    await reconcile(uid)
  } finally {
    pulling = false
  }
}

async function reconcile(uid: string): Promise<void> {
  if (!useCanvasStore.getState().hydrated) {
    await new Promise<void>((resolve) => {
      const unsub = useCanvasStore.subscribe((s) => {
        if (s.hydrated) {
          unsub()
          resolve()
        }
      })
    })
  }
  try {
    const remote = await fetchState(uid)
    if (!remote) {
      await useSyncStore.getState().syncNow()
      return
    }
    const localSavedAt =
      useSettingsStore.getState().lastSyncedAt ?? '' // best local marker
    const remoteNewer =
      !localSavedAt || (remote.savedAtClient || '') >= localSavedAt
    if (remoteNewer) {
      await useSyncStore.getState().restoreFromCloud()
    } else {
      await useSyncStore.getState().syncNow()
    }
  } catch {
    /* offline — try again next change/launch */
  }
}
