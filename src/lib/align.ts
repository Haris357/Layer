import type { Widget } from '../types/widget'

const THRESHOLD = 7

export interface SnapResult {
  x: number
  y: number
  v: number[]
  h: number[]
}

export function computeSnap(
  width: number,
  height: number,
  x: number,
  y: number,
  others: Widget[],
): SnapResult {
  const myV = [x, x + width / 2, x + width]
  const myH = [y, y + height / 2, y + height]
  let bestVd = THRESHOLD + 1
  let bestHd = THRESHOLD + 1
  const v: number[] = []
  const h: number[] = []

  for (const o of others) {
    const oV = [o.x, o.x + o.width / 2, o.x + o.width]
    const oH = [o.y, o.y + o.height / 2, o.y + o.height]
    for (const mv of myV) {
      for (const ov of oV) {
        const d = ov - mv
        if (Math.abs(d) <= THRESHOLD) {
          v.push(Math.round(ov))
          if (Math.abs(d) < Math.abs(bestVd)) bestVd = d
        }
      }
    }
    for (const mh of myH) {
      for (const oh of oH) {
        const d = oh - mh
        if (Math.abs(d) <= THRESHOLD) {
          h.push(Math.round(oh))
          if (Math.abs(d) < Math.abs(bestHd)) bestHd = d
        }
      }
    }
  }

  return {
    x: Math.abs(bestVd) <= THRESHOLD ? x + bestVd : x,
    y: Math.abs(bestHd) <= THRESHOLD ? y + bestHd : y,
    v: [...new Set(v)],
    h: [...new Set(h)],
  }
}
