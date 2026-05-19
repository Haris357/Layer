import { useEffect } from 'react'
import { isTauri, setHitRegions } from '../lib/ipc'

const PAD = 10

export function useHitRegions(): void {
  useEffect(() => {
    if (!isTauri()) return
    let last = ''

    const sync = () => {
      const dpr = window.devicePixelRatio || 1
      const els = document.querySelectorAll<HTMLElement>('[data-hit]')
      const regions: number[][] = []
      els.forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) return
        regions.push([
          Math.floor(r.left * dpr) - PAD,
          Math.floor(r.top * dpr) - PAD,
          Math.ceil(r.width * dpr) + PAD * 2,
          Math.ceil(r.height * dpr) + PAD * 2,
        ])
      })
      const key = JSON.stringify(regions)
      if (key !== last) {
        last = key
        setHitRegions(regions).catch(() => {})
      }
    }

    sync()
    const id = window.setInterval(sync, 100)
    return () => window.clearInterval(id)
  }, [])
}
