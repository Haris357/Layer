// One-shot UI sound effects — short clicks/chimes, distinct from the looping
// ambient focus sounds in ambientSound.ts. Files live in public/sounds and are
// served from the app root.

export type Sfx = 'switch-on' | 'switch-off' | 'timer'

const FILES: Record<Sfx, string> = {
  'switch-on': '/sounds/switch-on.mp3',
  'switch-off': '/sounds/switch-off.mp3',
  timer: '/sounds/timer.mp3',
}

const DEFAULT_VOLUME = 0.45

// One preloaded element per effect so the first play has no fetch delay.
const cache: Partial<Record<Sfx, HTMLAudioElement>> = {}

function base(name: Sfx): HTMLAudioElement {
  let a = cache[name]
  if (!a) {
    a = new Audio(FILES[name])
    a.preload = 'auto'
    cache[name] = a
  }
  return a
}

/** Play a one-shot effect. Cloned each time so rapid taps overlap cleanly. */
export function playSfx(name: Sfx, volume = DEFAULT_VOLUME): void {
  try {
    const a = base(name).cloneNode() as HTMLAudioElement
    a.volume = Math.max(0, Math.min(1, volume))
    a.play().catch(() => {})
  } catch {
    /* audio unavailable */
  }
}

/** Warm the cache so the very first effect plays instantly. */
export function preloadSfx(): void {
  ;(Object.keys(FILES) as Sfx[]).forEach((k) => base(k))
}
