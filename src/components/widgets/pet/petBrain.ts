import type { PetBrain } from '../../../types/widget'

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function newBrain(): PetBrain {
  return { born: Date.now(), affection: 20, hours: Array(24).fill(0) }
}

// The last hour of the day the user is usually still active: the latest hour
// whose activity is at least a third of the busiest hour. null until there's
// enough history (a few days) to say anything.
export function usualBedtime(hours: number[]): number | null {
  const max = Math.max(...hours)
  if (max < 120) return null
  let last: number | null = null
  for (let h = 12; h < 24; h++) if ((hours[h] ?? 0) >= max / 3) last = h
  return last
}

export function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)] ?? xs[0]!
}
