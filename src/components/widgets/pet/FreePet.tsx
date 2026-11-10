import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useMotionValue } from 'framer-motion'
import { Heart } from 'lucide-react'
import type { PetBrain, PetWidget, Widget } from '../../../types/widget'
import { getIdleMs, isTauri, setForceInteractive } from '../../../lib/ipc'
import { useCanvasStore } from '../../../store/canvasStore'
import { useMonitorStore, type MonitorRect } from '../../../store/monitorStore'
import { SettingsPopover } from '../SettingsPopover'
import { DEFAULT_PET_COLOR, PetArt, type Eyes, type Mouth } from './PetArt'
import { newBrain, pick, todayKey, usualBedtime } from './petBrain'

// A Desktop Pebble lives on the whole canvas, not in a card. It hops along the
// tops of your widgets and the bottom of the screen, jumps between them, and
// can be picked up and thrown.
//
// Motion model (one engine, no competing keyframe animations):
//  - fixed 120 Hz physics step, so it feels the same on any refresh rate;
//  - the body is a damped spring ("jelly"): impacts kick it, it wobbles and
//    settles on its own, and it stretches along fast motion;
//  - rotation is a second spring: spin decays in the air, rights itself on
//    landing;
//  - dragging pulls the pebble with a spring, so it trails the cursor and the
//    throw velocity is smooth rather than the last jittery mouse delta;
//  - it never slides: getting around is a series of small hops.

// ── Tunables ─────────────────────────────────────────────────────────────
export const PET_SIZE = 46
const FOOT = PET_SIZE * 0.93 // where it touches the ground, from the box top
const STEP = 1 / 120 // physics step (s)
const GRAVITY = 2400 // px/s²
const MAX_THROW = 3000 // px/s
const BOUNCE_AT = 320 // impact speed that still bounces
const RESTITUTION = 0.52 // bounce height kept per bounce
const SKID = 0.8 // horizontal speed kept per bounce
const WALL = 0.6 // speed kept off a wall
const HOP_T = 0.3 // air time of one little hop (s)
const HOP_DX = 52 // farthest a single hop goes (px)
const HOP_GAP = 0.09 // pause between hops (s)
// Jelly spring (squash/stretch). Underdamped: a couple of soft wobbles.
const JELLY_K = 420
const JELLY_C = 11
// Upright spring for rotation on the ground / while held.
const TILT_K = 240
const TILT_C = 19
// Drag follow spring: slightly under critical so it trails, never overshoots far.
const DRAG_K = 650
const DRAG_C = 46

const POLL_MS = 5_000
const AWAY_MS = 5 * 60_000
const BREAK_AFTER_MS = 90 * 60_000
const LEARN_EVERY_MS = 60_000
const BUBBLE_MS = 4_500

type Phase = 'ground' | 'air' | 'drag'
type Mood = 'idle' | 'walk' | 'sleep' | 'happy' | 'held' | 'air' | 'crouch'

interface Surface {
  x1: number
  x2: number
  y: number
  id: string | null // null = the bottom of the screen
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function viewportRect(): MonitorRect {
  return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
}

// The work area (screen minus taskbar) that contains a point, else the
// nearest one, so a pebble thrown into the gap between monitors comes back.
function monitorAt(x: number, y: number): MonitorRect {
  const work = useMonitorStore.getState().work
  if (!work.length) return viewportRect()
  let best = work[0]!
  let bestD = Infinity
  for (const m of work) {
    const dx = x < m.x ? m.x - x : x > m.x + m.w ? x - m.x - m.w : 0
    const dy = y < m.y ? m.y - y : y > m.y + m.h ? y - m.y - m.h : 0
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = m
    }
  }
  return best
}

// Things to stand on: the top edge of every widget on this screen, plus the
// screen's bottom edge.
function surfaces(mon: MonitorRect, selfId: string): Surface[] {
  const out: Surface[] = [{ x1: mon.x, x2: mon.x + mon.w, y: mon.y + mon.h, id: null }]
  for (const w of useCanvasStore.getState().widgets as Widget[]) {
    if (w.id === selfId || w.type === 'pet') continue
    if (w.y <= mon.y + FOOT || w.y >= mon.y + mon.h) continue
    if (w.x + w.width < mon.x || w.x > mon.x + mon.w) continue
    out.push({ x1: w.x, x2: w.x + w.width, y: w.y, id: w.id })
  }
  return out
}

function Zzz() {
  return (
    <div className="pointer-events-none absolute -top-1 right-0">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute text-[11px] font-extrabold"
          style={{ color: '#8C7BFF', textShadow: '0 0 3px #fff, 0 0 1px #fff' }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0], x: [0, 5, 10], y: [0, -12, -24], scale: [0.6, 1, 1.15] }}
          transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.85, ease: 'easeOut' }}
        >
          z
        </motion.span>
      ))}
    </div>
  )
}

function Hearts() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute left-1/2"
          initial={{ opacity: 0, y: 0, x: -5, scale: 0.3 }}
          animate={{ opacity: [0, 1, 0], y: -26 - i * 5, x: -5 + (i - 1) * 12, scale: [0.3, 1, 0.85] }}
          transition={{ duration: 1, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
        >
          <Heart size={10} fill="#FF6B9A" strokeWidth={0} />
        </motion.span>
      ))}
    </div>
  )
}

// A small soft puff where it lands hard.
function Dust({ x, y }: { x: number; y: number }) {
  return (
    <div className="pointer-events-none absolute" style={{ left: x, top: y, zIndex: 9000 }}>
      {[-1, -0.4, 0.4, 1].map((d, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: 6, height: 6, marginLeft: -3, marginTop: -3, background: 'rgba(255,255,255,0.75)' }}
          initial={{ x: 0, y: 0, scale: 0.5, opacity: 0.9 }}
          animate={{ x: d * 22, y: -6 - (1 - Math.abs(d)) * 6, scale: 1.25, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  )
}

export function FreePet({ widget }: { widget: PetWidget }) {
  const { t } = useTranslation()
  const liveUpdateWidget = useCanvasStore((s) => s.liveUpdateWidget)
  const isSelected = useCanvasStore((s) => s.selectedId === widget.id)
  const setSelected = useCanvasStore((s) => s.setSelected)

  // Rendered values. The engine writes these once per frame; React never
  // re-renders for motion.
  const px = useMotionValue(widget.x)
  const py = useMotionValue(widget.y)
  const rot = useMotionValue(0)
  const sqX = useMotionValue(1)
  const sqY = useMotionValue(1)
  const shX = useMotionValue(widget.x + PET_SIZE / 2)
  const shY = useMotionValue(widget.y + FOOT)
  const shS = useMotionValue(1)

  const [mood, setMoodState] = useState<Mood>('air')
  const [facing, setFacing] = useState<1 | -1>(1)
  const [eyes, setEyes] = useState<Eyes>('open')
  const [bubble, setBubble] = useState<string | null>(null)
  const [hearts, setHearts] = useState(0)
  const [dust, setDust] = useState<{ id: number; x: number; y: number }[]>([])

  // ── Engine state (refs: read and written every physics step) ──────────
  const pos = useRef({ x: widget.x, y: widget.y })
  const vel = useRef({ x: 0, y: 0 })
  const jelly = useRef({ s: 0, v: 0, target: 0 }) // s < 0 squash, s > 0 stretch
  const tilt = useRef({ a: 0, v: 0 }) // degrees
  const phase = useRef<Phase>('air')
  const soft = useRef(false) // next landing is a planned one: no bounce
  const support = useRef<Surface | null>(null)
  const walkTo = useRef<number | null>(null)
  const hop = useRef<{ at: number; vx: number; vy: number } | null>(null)
  const nextHopAt = useRef(0)
  const dragTarget = useRef<{ x: number; y: number } | null>(null)
  const mon = useRef<MonitorRect>(monitorAt(widget.x, widget.y))
  const clock = useRef(0) // engine time (s)
  const raf = useRef<number | null>(null)
  const lastFrame = useRef(0)
  const acc = useRef(0)
  const moodRef = useRef<Mood>('air')
  const selectedRef = useRef(isSelected)
  selectedRef.current = isSelected

  const brain = widget.brain ?? newBrain()
  const brainRef = useRef(brain)
  brainRef.current = brain
  const name = widget.ownerName || t('pet.friend')

  const setMood = useCallback((m: Mood) => {
    if (moodRef.current === m) return
    moodRef.current = m
    setMoodState(m)
  }, [])

  const say = useCallback(
    (text: string) => {
      if (widget.bubbles === false) return
      setBubble(text)
      window.setTimeout(() => setBubble((b) => (b === text ? null : b)), BUBBLE_MS)
    },
    [widget.bubbles],
  )

  const saveBrain = useCallback(
    (patch: Partial<PetBrain>) => liveUpdateWidget(widget.id, { brain: { ...brainRef.current, ...patch } }),
    [liveUpdateWidget, widget.id],
  )

  const savePos = useCallback(() => {
    liveUpdateWidget(widget.id, { x: Math.round(pos.current.x), y: Math.round(pos.current.y), width: PET_SIZE, height: PET_SIZE })
  }, [liveUpdateWidget, widget.id])

  const puff = useCallback(() => {
    const id = Date.now() + Math.random()
    setDust((d) => [...d, { id, x: pos.current.x + PET_SIZE / 2, y: pos.current.y + FOOT }])
    window.setTimeout(() => setDust((d) => d.filter((p) => p.id !== id)), 600)
  }, [])

  // Kick the jelly: negative squashes (landing, crouch), positive stretches.
  const wobble = (impulse: number) => {
    jelly.current.v += impulse
  }

  // Plan a hop (or a bigger jump) with an anticipation crouch first.
  const planHop = (vx: number, vy: number, crouch: number, delay: number) => {
    wobble(-crouch)
    hop.current = { at: clock.current + delay, vx, vy }
    if (Math.abs(vx) > 5) setFacing(vx > 0 ? 1 : -1)
  }

  // ── Landing ───────────────────────────────────────────────────────────
  const land = (s: Surface, impact: number) => {
    const p = pos.current
    const v = vel.current
    p.y = s.y - FOOT
    support.current = s
    // squash in proportion to how hard it hit
    wobble(-clamp((impact / 1000) * 2.4, 0.5, 5))
    if (!soft.current && impact >= BOUNCE_AT) {
      v.y = -impact * RESTITUTION
      v.x *= SKID
      tilt.current.v *= 0.6
      if (impact > 850) puff()
      return
    }
    soft.current = false
    v.x = 0
    v.y = 0
    phase.current = 'ground'
    if (walkTo.current !== null) {
      setMood('walk')
      nextHopAt.current = clock.current + HOP_GAP
    } else {
      if (moodRef.current !== 'sleep') setMood('idle')
      savePos()
    }
  }

  // ── One physics step ──────────────────────────────────────────────────
  const tick = (dt: number) => {
    const p = pos.current
    const v = vel.current
    const j = jelly.current
    const r = tilt.current
    let m = mon.current
    let tiltTarget = 0
    j.target = 0

    if (phase.current === 'drag' && dragTarget.current) {
      // spring toward the cursor
      const tx = dragTarget.current.x
      const ty = dragTarget.current.y
      v.x += ((tx - p.x) * DRAG_K - v.x * DRAG_C) * dt
      v.y += ((ty - p.y) * DRAG_K - v.y * DRAG_C) * dt
      p.x += v.x * dt
      p.y += v.y * dt
      // dangle against the motion, stretch with speed
      tiltTarget = clamp(-v.x * 0.03, -30, 30)
      j.target = clamp(Math.hypot(v.x, v.y) / 5000, 0, 0.12)
      m = mon.current = monitorAt(p.x + PET_SIZE / 2, p.y + FOOT / 2)
    } else if (phase.current === 'air') {
      m = mon.current = monitorAt(p.x + PET_SIZE / 2, p.y + FOOT / 2)
      const prevFeet = p.y + FOOT
      v.y += GRAVITY * dt
      p.x += v.x * dt
      p.y += v.y * dt
      if (p.x < m.x) {
        p.x = m.x
        v.x = Math.abs(v.x) * WALL
        r.v = -r.v * 0.5
        wobble(-0.8)
      } else if (p.x > m.x + m.w - PET_SIZE) {
        p.x = m.x + m.w - PET_SIZE
        v.x = -Math.abs(v.x) * WALL
        r.v = -r.v * 0.5
        wobble(-0.8)
      }
      if (p.y < m.y) {
        p.y = m.y
        v.y = Math.abs(v.y) * 0.3
      }
      // free spin, slowly losing energy
      r.a += r.v * dt
      r.v *= Math.exp(-0.8 * dt)
      // stretch along a fast fall or rise
      j.target = clamp(Math.abs(v.y) / 3800, 0, 0.14)
      if (v.y > 0) {
        const feet = p.y + FOOT
        const cx = p.x + PET_SIZE / 2
        let hit: Surface | null = null
        for (const s of surfaces(m, widget.id)) {
          if (cx < s.x1 + 4 || cx > s.x2 - 4) continue
          if (prevFeet <= s.y + 0.5 && feet >= s.y && (!hit || s.y < hit.y)) hit = s
        }
        // Below the floor (it moved, or the pebble was saved off-screen):
        // the floor still catches it, never an endless fall.
        const floorY = m.y + m.h
        if (!hit && feet >= floorY) hit = { x1: m.x, x2: m.x + m.w, y: floorY, id: null }
        if (hit) land(hit, v.y)
      }
    } else {
      // On the ground: launch a planned hop, or plan the next one.
      const h = hop.current
      if (h && clock.current >= h.at) {
        hop.current = null
        support.current = null
        v.x = h.vx
        v.y = h.vy
        phase.current = 'air'
        soft.current = true
        if (moodRef.current === 'crouch') setMood('air')
      } else if (!h && walkTo.current !== null && clock.current >= nextHopAt.current) {
        const dx = walkTo.current - p.x
        if (Math.abs(dx) < 3) {
          walkTo.current = null
          setMood('idle')
          savePos()
        } else {
          const step = Math.sign(dx) * Math.min(Math.abs(dx), HOP_DX)
          planHop(step / HOP_T, (-GRAVITY * HOP_T) / 2, 1.3, 0.07)
        }
      }
    }

    // Rotation: free in the air, sprung upright (or to the dangle) otherwise.
    if (phase.current !== 'air') {
      r.v += (-(r.a - tiltTarget) * TILT_K - r.v * TILT_C) * dt
      r.a += r.v * dt
    }
    // Jelly spring.
    j.v += (-(j.s - j.target) * JELLY_K - j.v * JELLY_C) * dt
    j.s = clamp(j.s + j.v * dt, -0.45, 0.3)
  }

  // ── Frame: run fixed steps, then draw once ────────────────────────────
  const draw = () => {
    const p = pos.current
    const j = jelly.current
    px.set(p.x)
    py.set(p.y)
    rot.set(tilt.current.a)
    // volume-ish: squashing widens, stretching narrows
    sqY.set(1 + j.s)
    sqX.set(1 - j.s * 0.85)
    // shadow on whatever is underneath, smaller and fainter with height
    const cx = p.x + PET_SIZE / 2
    const feet = p.y + FOOT
    let below = mon.current.y + mon.current.h
    for (const s of surfaces(mon.current, widget.id)) {
      if (cx >= s.x1 && cx <= s.x2 && s.y >= feet - 1 && s.y < below) below = s.y
    }
    shX.set(cx)
    shY.set(below)
    shS.set((1 - clamp((below - feet) / 380, 0, 0.75)) * (1 - j.s * 0.6))
  }

  const resting = () => {
    const j = jelly.current
    const r = tilt.current
    return (
      phase.current === 'ground' &&
      walkTo.current === null &&
      hop.current === null &&
      Math.abs(j.s) < 0.002 &&
      Math.abs(j.v) < 0.02 &&
      Math.abs(r.a) < 0.1 &&
      Math.abs(r.v) < 0.1
    )
  }

  const kick = useCallback(() => {
    if (raf.current !== null) return
    lastFrame.current = performance.now()
    acc.current = 0
    const frame = (now: number) => {
      acc.current += Math.min(0.05, (now - lastFrame.current) / 1000)
      lastFrame.current = now
      while (acc.current >= STEP) {
        tick(STEP)
        clock.current += STEP
        acc.current -= STEP
      }
      if (resting()) {
        // settle exactly, then stop until something happens
        jelly.current = { s: 0, v: 0, target: 0 }
        tilt.current = { a: 0, v: 0 }
        draw()
        raf.current = null
        return
      }
      draw()
      raf.current = requestAnimationFrame(frame)
    }
    raf.current = requestAnimationFrame(frame)
    // tick/draw/resting read only refs; a stable kick is what we want
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Start by dropping onto whatever's below.
  useEffect(() => {
    phase.current = 'air'
    kick()
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
      raf.current = null
    }
  }, [kick])

  // While standing, keep checking the ground: ride along with a widget that
  // moves, fall when it's dragged away or deleted.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (phase.current !== 'ground') return
      const p = pos.current
      const s = support.current
      const cx = p.x + PET_SIZE / 2
      if (s?.id) {
        const w = useCanvasStore.getState().widgets.find((x) => x.id === s.id)
        if (w && cx >= w.x && cx <= w.x + w.width) {
          support.current = { x1: w.x, x2: w.x + w.width, y: w.y, id: w.id }
          if (Math.abs(w.y - s.y) > 0.5) {
            p.y = w.y - FOOT
            draw()
          }
          return
        }
      } else {
        const m = monitorAt(cx, p.y + FOOT)
        mon.current = m
        if (Math.abs(p.y + FOOT - (m.y + m.h)) <= 0.5) return
      }
      // nothing under it any more: fall
      support.current = null
      walkTo.current = null
      hop.current = null
      vel.current = { x: 0, y: 0 }
      phase.current = 'air'
      if (moodRef.current !== 'sleep') setMood('air')
      kick()
    }, 120)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kick, setMood])

  // Wandering: hop along the current surface, or jump to another widget.
  useEffect(() => {
    let id: number
    const next = () => {
      id = window.setTimeout(() => {
        if (phase.current === 'ground' && moodRef.current === 'idle' && !selectedRef.current) {
          const s = support.current
          const x = pos.current.x
          const r = Math.random()
          if (r < 0.55 && s) {
            const lo = Math.max(s.x1, mon.current.x)
            const hi = Math.min(s.x2, mon.current.x + mon.current.w) - PET_SIZE
            if (hi - lo > 16) {
              const goal = lo + Math.random() * (hi - lo)
              if (Math.abs(goal - x) > 20) {
                walkTo.current = goal
                nextHopAt.current = clock.current
                setMood('walk')
                kick()
              }
            }
          } else if (r < 0.8) {
            const options = surfaces(mon.current, widget.id).filter((p) => p.x2 - p.x1 >= PET_SIZE + 8 && p.id !== s?.id)
            const dest = options.length ? pick(options) : null
            if (dest) {
              const lo = Math.max(dest.x1, mon.current.x)
              const hi = Math.min(dest.x2, mon.current.x + mon.current.w) - PET_SIZE
              const gx = lo + Math.random() * Math.max(0, hi - lo)
              // Solve the arc that lands exactly on the target; a deeper
              // crouch first for a big jump.
              const dx = gx - x
              const dy = dest.y - FOOT - pos.current.y
              const T = clamp(Math.hypot(dx, dy) / 560, 0.42, 0.9)
              setMood('crouch')
              planHop(dx / T, (dy - 0.5 * GRAVITY * T * T) / T, 2.4, 0.16)
              kick()
            }
          }
        }
        next()
      }, 3500 + Math.random() * 5000)
    }
    next()
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kick, setMood, widget.id])

  // Blinking.
  useEffect(() => {
    if (mood === 'sleep' || mood === 'happy') return
    let id: number
    const loop = () => {
      id = window.setTimeout(() => {
        setEyes('blink')
        window.setTimeout(() => setEyes('open'), 120)
        loop()
      }, 2200 + Math.random() * 3200)
    }
    loop()
    return () => window.clearTimeout(id)
  }, [mood])

  // Greeting.
  useEffect(() => {
    const h = new Date().getHours()
    const key = h < 12 ? 'pet.lines.morning' : h < 18 ? 'pet.lines.hello' : 'pet.lines.evening'
    const id = window.setTimeout(() => say(t(key, { name })), 1200)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The brain: sleep while you're away, greet you back, learn your hours,
  // nudge a break, yawn near your usual bedtime. All on-device.
  useEffect(() => {
    let activeSince = Date.now()
    let nudged = false
    let lastLearn = Date.now()
    let alive = true
    const tickBrain = async () => {
      const idle = isTauri() ? await getIdleMs().catch(() => 0) : 0
      if (!alive) return
      const now = Date.now()
      if (idle >= AWAY_MS) {
        if (moodRef.current !== 'sleep' && phase.current === 'ground') {
          walkTo.current = null
          hop.current = null
          setMood('sleep')
        }
        activeSince = now
        nudged = false
        return
      }
      if (moodRef.current === 'sleep') {
        wake()
        say(t('pet.lines.welcomeBack', { name }))
      }
      if (!nudged && now - activeSince >= BREAK_AFTER_MS) {
        nudged = true
        say(t('pet.lines.break', { name, h: Math.round(((now - activeSince) / 3_600_000) * 10) / 10 }))
      }
      if (now - lastLearn >= LEARN_EVERY_MS) {
        lastLearn = now
        const b = brainRef.current
        const hours = b.hours.map((v) => v * 0.999)
        const hr = new Date().getHours()
        hours[hr] = (hours[hr] ?? 0) + 1
        const patch: Partial<PetBrain> = { hours, affection: Math.max(0, b.affection - 0.01) }
        const bed = usualBedtime(hours)
        const day = todayKey()
        if (bed !== null && new Date().getHours() >= bed && b.lastYawnDay !== day) {
          patch.lastYawnDay = day
          say(t('pet.lines.sleepy', { name }))
        }
        saveBrain(patch)
      }
    }
    const id = window.setInterval(tickBrain, POLL_MS)
    tickBrain()
    return () => {
      alive = false
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, say, saveBrain])

  // A happy little hop straight up, with hearts.
  const wake = () => {
    if (phase.current !== 'ground') return
    walkTo.current = null
    setMood('happy')
    setHearts((n) => n + 1)
    planHop(0, -560, 1.6, 0.06)
    kick()
    window.setTimeout(() => moodRef.current === 'happy' && setMood('idle'), 1300)
  }

  const onPet = () => {
    if (moodRef.current === 'sleep') {
      say(t('pet.lines.wokeUp'))
      setMood('idle')
      wake()
      return
    }
    if (phase.current !== 'ground' || hop.current) return
    wake()
    saveBrain({ affection: Math.min(100, brainRef.current.affection + 2) })
    if (Math.random() < 0.45) say(t(pick(['pet.lines.yay', 'pet.lines.hehe', 'pet.lines.again']), { name }))
  }

  // ── Grab, drag and throw ──────────────────────────────────────────────
  const clickTimer = useRef<number | null>(null)
  const grab = useRef<{ ox: number; oy: number; sx: number; sy: number; moved: boolean } | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    // The settings popover lives inside the pebble's element; a press there
    // must reach its buttons, not start a grab (pointer capture would
    // swallow it).
    if ((e.target as HTMLElement).closest('[data-popover]')) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    grab.current = {
      ox: e.clientX - pos.current.x,
      oy: e.clientY - pos.current.y,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = grab.current
    if (!g) return
    if (!g.moved) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 5) return
      g.moved = true
      // Picked up: the whole window takes the pointer so the drag can go
      // anywhere, not just over the pebble's own hit box.
      setForceInteractive(true).catch(() => {})
      phase.current = 'drag'
      walkTo.current = null
      hop.current = null
      support.current = null
      vel.current = { x: 0, y: 0 }
      setSelected(null)
      setMood('held')
      wobble(0.9) // a little stretch as it's lifted
      if (Math.random() < 0.3) say(t('pet.lines.held'))
      kick()
    }
    dragTarget.current = { x: e.clientX - g.ox, y: e.clientY - g.oy }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = grab.current
    grab.current = null
    if (!g) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (!g.moved) {
      // Wait a beat so a double-click can open the settings instead.
      if (clickTimer.current) {
        window.clearTimeout(clickTimer.current)
        clickTimer.current = null
        walkTo.current = null
        setSelected(selectedRef.current ? null : widget.id)
        return
      }
      clickTimer.current = window.setTimeout(() => {
        clickTimer.current = null
        onPet()
      }, 240)
      return
    }
    setForceInteractive(false).catch(() => {})
    dragTarget.current = null
    // Throw with the spring's own velocity: smooth, never a jittery delta.
    const v = vel.current
    const sp = Math.hypot(v.x, v.y)
    if (sp > MAX_THROW) {
      v.x = (v.x / sp) * MAX_THROW
      v.y = (v.y / sp) * MAX_THROW
    }
    tilt.current.v = clamp(v.x * 0.35, -900, 900)
    phase.current = 'air'
    soft.current = false
    setMood('air')
    if (Math.abs(v.x) > 30) setFacing(v.x > 0 ? 1 : -1)
    if (sp > 1400 && Math.random() < 0.6) say(t('pet.lines.wee'))
    kick()
  }

  // No right-click menu for the pebble; double-click opens its settings.
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // ── Look ─────────────────────────────────────────────────────────────
  const asleep = mood === 'sleep'
  const happy = mood === 'happy'
  const held = mood === 'held'
  const shownEyes: Eyes = asleep ? 'closed' : happy ? 'happy' : held ? 'wide' : eyes
  const mouth: Mouth = asleep ? 'sleep' : happy ? 'open' : held || mood === 'air' ? 'o' : 'smile'
  // The face slides toward where it's heading.
  const look = mood === 'walk' || mood === 'air' || mood === 'crouch' ? facing * 0.8 : 0
  const breathing = mood === 'idle' || asleep

  return (
    <>
      {/* soft contact shadow on whatever is underneath */}
      <motion.div
        className="pointer-events-none absolute left-0 top-0 rounded-[50%]"
        style={{
          x: shX,
          y: shY,
          scale: shS,
          opacity: shS,
          width: PET_SIZE * 0.66,
          height: 6,
          marginLeft: -PET_SIZE * 0.33,
          marginTop: -3,
          background: 'radial-gradient(closest-side, rgba(0,0,0,0.28), rgba(0,0,0,0))',
          zIndex: 8999,
        }}
      />
      {dust.map((d) => (
        <Dust key={d.id} x={d.x} y={d.y} />
      ))}

      <motion.div
        data-hit
        data-widget-id={widget.id}
        className="absolute left-0 top-0 select-none"
        style={{
          x: px,
          y: py,
          width: PET_SIZE,
          height: PET_SIZE,
          zIndex: 9001,
          cursor: held ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: widget.opacity ?? 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <AnimatePresence>
          {bubble && (
            <motion.div
              key={bubble}
              initial={{ opacity: 0, y: 6, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              style={{ originY: 1, background: 'rgba(255,255,255,0.97)', color: '#2E2A3A', border: '1.5px solid rgba(46,42,58,0.14)' }}
              className="pointer-events-none absolute bottom-full left-1/2 mb-2.5 w-max max-w-[180px] -translate-x-1/2 rounded-[12px] px-2.5 py-1.5 text-center text-[11.5px] font-semibold leading-snug"
            >
              {bubble}
              <span
                className="absolute left-1/2 top-full -translate-x-1/2"
                style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid rgba(255,255,255,0.96)' }}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>{asleep && <motion.div key="z" exit={{ opacity: 0 }}><Zzz /></motion.div>}</AnimatePresence>
        <AnimatePresence>{hearts > 0 && happy && <Hearts key={hearts} />}</AnimatePresence>

        {/* rotation spring */}
        <motion.div className="h-full w-full" style={{ rotate: rot, originY: 0.62 }}>
          {/* jelly squash & stretch, anchored at the base */}
          <motion.div className="h-full w-full" style={{ scaleX: sqX, scaleY: sqY, originY: 0.93 }}>
            {/* gentle breathing only while resting; everything else is physics */}
            <motion.div
              className="h-full w-full"
              style={{ originY: 0.93 }}
              animate={breathing ? { scaleY: [1, asleep ? 0.96 : 1.02, 1], scaleX: [1, asleep ? 1.03 : 0.99, 1] } : { scaleY: 1, scaleX: 1 }}
              transition={breathing ? { duration: asleep ? 3.6 : 2.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
            >
              <PetArt color={widget.accent || DEFAULT_PET_COLOR} eyes={shownEyes} mouth={mouth} look={look} glow={widget.glow === true} />
            </motion.div>
          </motion.div>
        </motion.div>

        <AnimatePresence>{isSelected && <SettingsPopover widget={widget} />}</AnimatePresence>
      </motion.div>
    </>
  )
}
