import { useEffect } from 'react'
import { useSyncStore } from '../store/syncStore'
import { isTauri } from '../lib/ipc'

// Initialise the cloud-sync auth listener once, on app start.
export function useSync(): void {
  useEffect(() => {
    if (!isTauri()) return
    useSyncStore.getState().init()
  }, [])
}
