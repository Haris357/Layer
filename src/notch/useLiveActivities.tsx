import { useEffect, useState, type ReactNode } from 'react'
import { Timer as TimerIcon, BatteryCharging } from 'lucide-react'
import {
  getNowPlaying,
  getSystemStats,
  type NowPlaying,
  type SystemStats,
} from '../lib/ipc'
import { useTimerStore, timerRemaining } from './timerStore'
import type { NotchModuleId } from './notchStore'

export interface LiveActivity {
  id: string
  module: NotchModuleId
  leading: ReactNode
  trailing: ReactNode
}

// Tiny animated equalizer shown next to the now-playing activity.
function Eq({ playing }: { playing: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2px]">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full bg-white/85"
          style={{
            height: '40%',
            animation: playing
              ? `notch-eq 1s ease-in-out ${i * 0.13}s infinite`
              : undefined,
          }}
        />
      ))}
    </span>
  )
}

function fmt(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Picks the single highest-priority live activity for the collapsed notch:
// timer (running) > now-playing > charging.
export function useLiveActivities(): LiveActivity | null {
  const [np, setNp] = useState<NowPlaying | null>(null)
  const [stats, setStats] = useState<SystemStats | null>(null)
  const timer = useTimerStore()
  const [, force] = useState(0)

  useEffect(() => {
    let alive = true
    const poll = () => {
      getNowPlaying().then((v) => alive && setNp(v)).catch(() => {})
      getSystemStats().then((v) => alive && setStats(v)).catch(() => {})
    }
    poll()
    const id = window.setInterval(poll, 2500)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  // Re-render every second while a timer runs so the countdown ticks.
  useEffect(() => {
    if (!timer.running) return
    const id = window.setInterval(() => force((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [timer.running])

  const rem = timerRemaining(timer)
  if (timer.running && rem > 0) {
    return {
      id: 'timer',
      module: 'timer',
      leading: <TimerIcon size={14} className="text-amber-400" />,
      trailing: (
        <span className="text-[12px] font-semibold tabular-nums text-white">
          {fmt(rem)}
        </span>
      ),
    }
  }

  if (np?.hasSession && np.playing && (np.title || np.artist)) {
    return {
      id: 'np',
      module: 'nowplaying',
      leading: <Eq playing />,
      trailing: (
        <span className="max-w-[150px] truncate text-[12px] font-medium text-white/90">
          {np.title || np.artist}
        </span>
      ),
    }
  }

  if (stats && stats.charging && stats.battery >= 0) {
    return {
      id: 'charging',
      module: 'system',
      leading: <BatteryCharging size={14} className="text-green-400" />,
      trailing: (
        <span className="text-[12px] font-semibold text-white">
          {stats.battery}%
        </span>
      ),
    }
  }

  return null
}
