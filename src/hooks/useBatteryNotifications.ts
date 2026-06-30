import { useEffect, useRef } from 'react'
import { getSystemStats } from '../lib/ipc'
import { notify } from '../lib/notify'
import i18n from '../lib/i18n'

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
              title: i18n.t('notify.battery20Title'),
              body: i18n.t('notify.battery20Body'),
              dedupe: `low-20-${dayKey()}`,
            })
          }
          if (!charging && prev.battery > 10 && battery <= 10) {
            notify({
              kind: 'battery',
              title: i18n.t('notify.battery10Title'),
              body: i18n.t('notify.battery10Body'),
              dedupe: `low-10-${dayKey()}`,
            })
          }
          if (charging && prev.battery < 100 && battery >= 100) {
            notify({
              kind: 'battery',
              title: i18n.t('notify.batteryFullTitle'),
              body: i18n.t('notify.batteryFullBody'),
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
