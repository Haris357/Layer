import { useEffect } from 'react'
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { notify } from '../lib/notify'

const KEY_IDS = 'layer-my-templates'
const KEY_BASELINE = 'layer-my-templates-baseline'
const MILESTONES = [10, 50, 100, 250, 500, 1000]

interface BaselineEntry {
  up: number
  down: number
  name: string
  lastMilestone: number
}

interface Baseline {
  [id: string]: BaselineEntry
}

function readIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_IDS) || '[]')
  } catch {
    return []
  }
}

function readBaseline(): Baseline {
  try {
    return JSON.parse(localStorage.getItem(KEY_BASELINE) || '{}')
  } catch {
    return {}
  }
}

function writeBaseline(b: Baseline) {
  try {
    localStorage.setItem(KEY_BASELINE, JSON.stringify(b))
  } catch {
    /* ignore */
  }
}

// Real-time listener for templates this device published.
// Fires upvote notifications + milestone notifications (10/50/100/...).
export function useGalleryNotifications(): void {
  useEffect(() => {
    const ids = readIds()
    if (ids.length === 0) return

    const baseline = readBaseline()
    const unsubs: Unsubscribe[] = ids.map((id) =>
      onSnapshot(doc(db, 'templates', id), (snap) => {
        const data = snap.data() as
          | { upvotes?: number; downvotes?: number; name?: string }
          | undefined
        if (!data) return

        const up = data.upvotes ?? 0
        const down = data.downvotes ?? 0
        const name = data.name ?? 'your template'
        const prev = baseline[id]

        if (prev) {
          if (up > prev.up) {
            const delta = up - prev.up
            notify({
              kind: 'upvote',
              title:
                delta === 1
                  ? `Someone upvoted "${name}" 🎉`
                  : `${delta} new upvotes on "${name}" 🎉`,
              templateId: id,
            })
          }
          const lastMile = prev.lastMilestone ?? 0
          const crossed = MILESTONES.find((m) => up >= m && lastMile < m)
          if (crossed) {
            notify({
              kind: 'milestone',
              title: `"${name}" hit ${crossed} upvotes ✦`,
              body: 'Congrats — that template is finding its people.',
              templateId: id,
              dedupe: `milestone-${id}-${crossed}`,
            })
            baseline[id] = { up, down, name, lastMilestone: crossed }
          } else {
            baseline[id] = { up, down, name, lastMilestone: lastMile }
          }
        } else {
          // First sighting — establish baseline silently (no notification).
          const initialMile = MILESTONES.reduce(
            (acc, m) => (up >= m ? m : acc),
            0,
          )
          baseline[id] = { up, down, name, lastMilestone: initialMile }
        }
        writeBaseline(baseline)
      }),
    )

    return () => unsubs.forEach((u) => u())
  }, [])
}

// Helper called by the publish flow to register a doc for real-time tracking.
export function rememberMyTemplate(id: string): void {
  try {
    const ids: string[] = JSON.parse(localStorage.getItem(KEY_IDS) || '[]')
    if (!ids.includes(id)) {
      ids.push(id)
      localStorage.setItem(KEY_IDS, JSON.stringify(ids))
    }
  } catch {
    /* ignore */
  }
}
