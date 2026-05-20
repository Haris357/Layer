import { useEffect, useRef } from 'react'
import { getSystemStats } from '../lib/ipc'
import { notify } from '../lib/notify'

function dayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

// Polls system stats once a minute and fires battery notifications on
// threshold crossings: 20% (warn), 10% (urgent), 100% while charging.
export function useBatteryNotifications(): void {
  const last = useRef<{ battery: number; charging: boolean } | null>(null)

  useEffect(() => {
    let alive = true

    const tick = async () => {
      try {
        const s = await getSystemStats()
        if (!alive) return
        const battery = Math.round(s.battery)
        const charging = s.charging
        const prev = last.current

        if (prev) {
          if (
            !charging &&
            prev.battery > 20 &&
            battery <= 20 &&
            battery > 10
          ) {
            notify({
              kind: 'battery',
              title: 'Battery at 20%',
              body: 'Might be time to plug in.',
              dedupe: `low-20-${dayKey()}`,
            })
          }
          if (!charging && prev.battery > 10 && battery <= 10) {
            notify({
              kind: 'battery',
              title: 'Battery at 10%',
              body: 'Time to plug in.',
              dedupe: `low-10-${dayKey()}`,
            })
          }
          if (charging && prev.battery < 100 && battery >= 100) {
            notify({
              kind: 'battery',
              title: 'Battery fully charged',
              body: 'You can unplug now.',
              dedupe: `full-${dayKey()}`,
            })
          }
        }
        last.current = { battery, charging }
      } catch {
        /* ignore polling errors */
      }
    }

    tick()
    const id = window.setInterval(tick, 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])
}
