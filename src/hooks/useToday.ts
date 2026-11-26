import { useEffect, useState } from 'react'

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Today's date (local midnight), kept current: it rolls over at midnight and
 * re-checks when the PC wakes or Layer regains focus (timers drift or pause
 * while asleep). Before this the Calendar kept highlighting the day Layer was
 * started until it was restarted (GitHub #5).
 */
export function useToday(): Date {
  const [today, setToday] = useState(startOfToday)

  useEffect(() => {
    let timer: number
    const check = () => {
      const now = startOfToday()
      setToday((t) => (t.getTime() === now.getTime() ? t : now))
    }
    const schedule = () => {
      const next = startOfToday()
      next.setDate(next.getDate() + 1)
      // a second past midnight, so the new day has definitely begun
      timer = window.setTimeout(() => {
        check()
        schedule()
      }, next.getTime() - Date.now() + 1000)
    }
    schedule()
    // Sleep/resume and long-idle catch-up.
    const id = window.setInterval(check, 60_000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(id)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  return today
}
