// Tiny dependency-free confetti. Uses CSS transform animations (GPU-composited)
// so it stays smooth even on Layer's click-through window. Fire on a milestone.

const COLORS = [
  '#f0a020',
  '#34c759',
  '#6366f1',
  '#ec4899',
  '#2dd4bf',
  '#fbbf24',
  '#f87171',
]

let last = 0

export function fireConfetti(count = 90): void {
  // Debounce so rapid triggers don't stack into a mess.
  const now = Date.now()
  if (now - last < 800) return
  last = now

  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:99998;overflow:hidden'
  document.body.appendChild(container)

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div')
    const color = COLORS[i % COLORS.length]
    const left = Math.random() * 100
    const w = 6 + Math.random() * 6
    const dur = 1.9 + Math.random() * 1.5
    const delay = Math.random() * 0.35
    const xDrift = (Math.random() - 0.5) * 260
    const rot = Math.random() * 900 - 450
    p.style.cssText =
      `position:absolute;top:-24px;left:${left}vw;width:${w}px;height:${w * 0.5}px;` +
      `background:${color};border-radius:1px;opacity:0.95;will-change:transform;` +
      `--x:${xDrift}px;--r:${rot}deg;` +
      `animation:confetti-fall ${dur}s cubic-bezier(.15,.5,.4,1) ${delay}s forwards`
    container.appendChild(p)
  }

  window.setTimeout(() => container.remove(), 4200)
}
