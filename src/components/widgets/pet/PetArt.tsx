import { useId } from 'react'
import { motion } from 'framer-motion'

export type Eyes = 'open' | 'blink' | 'closed' | 'happy' | 'wide' | 'dizzy'
export type Mouth = 'smile' | 'open' | 'sleep' | 'o' | 'frown'

// Flat, soft pastels (lavender, rose, mint, …). The pet's color is its widget
// accent (the same one the right-click menu sets on every widget); these are
// the quick picks.
export const PET_COLORS = ['#ADB2EC', '#EBB0C6', '#C3ECB0', '#F3D59F', '#A9D6EA', '#CBB8EE', '#F1B9A6']
export const DEFAULT_PET_COLOR = PET_COLORS[0]!

const INK = '#141218'
const LINE = 3.4

// A lopsided pebble: flatter, wider top, bulging left side, narrower bottom
// leaning right. Not a circle.
const PEBBLE = 'M21 31 C29 18 61 13 78 21 C93 29 91 57 82 73 C72 90 47 97 32 89 C16 81 8 61 10 47 C11 40 15 35 21 31 Z'

// Eyes are wide arcs, never dots: ◠ content, ◡ asleep / sad.
function Eye({ cx, cy, eyes }: { cx: number; cy: number; eyes: Eyes }) {
  if (eyes === 'dizzy') {
    return (
      <motion.path
        d={`M${cx} ${cy} m-1 0 a1 1 0 1 1 2 0 a2.8 2.8 0 1 1 -5.2 0 a4.4 4.4 0 1 1 8.8 0`}
        fill="none"
        stroke={INK}
        strokeWidth={2.4}
        strokeLinecap="round"
        style={{ originX: `${cx}px`, originY: `${cy}px` }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
      />
    )
  }
  const down = eyes === 'closed'
  const w = eyes === 'wide' ? 9.5 : 8.5
  const h = eyes === 'wide' ? 8 : 6.5
  const d = down
    ? `M${cx - w} ${cy - 2} C${cx - w * 0.7} ${cy + h} ${cx + w * 0.7} ${cy + h} ${cx + w} ${cy - 2}`
    : `M${cx - w} ${cy + 2.5} C${cx - w * 0.7} ${cy - h} ${cx + w * 0.7} ${cy - h} ${cx + w} ${cy + 2.5}`
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={INK}
      strokeWidth={LINE}
      strokeLinecap="round"
      style={{ originX: `${cx}px`, originY: `${cy}px` }}
      // a blink squashes the arc flat for a moment
      animate={{ scaleY: eyes === 'blink' ? 0.15 : 1 }}
      transition={{ duration: 0.08 }}
    />
  )
}

function MouthShape({ mouth, cx, cy }: { mouth: Mouth; cx: number; cy: number }) {
  if (mouth === 'open') return <path d={`M${cx - 5} ${cy - 1} C${cx - 4} ${cy + 7} ${cx + 4} ${cy + 7} ${cx + 5} ${cy - 1} Z`} fill={INK} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
  if (mouth === 'o') return <ellipse cx={cx} cy={cy + 1.5} rx={2.4} ry={2.9} fill="none" stroke={INK} strokeWidth={2.6} />
  if (mouth === 'sleep') return <path d={`M${cx - 2.5} ${cy + 1.5} H${cx + 2.5}`} stroke={INK} strokeWidth={LINE} strokeLinecap="round" />
  if (mouth === 'frown') return <path d={`M${cx - 4.5} ${cy + 4} C${cx - 3.5} ${cy - 1.5} ${cx + 3.5} ${cy - 1.5} ${cx + 4.5} ${cy + 4}`} fill="none" stroke={INK} strokeWidth={LINE} strokeLinecap="round" />
  return <path d={`M${cx - 5.5} ${cy} C${cx - 4} ${cy + 6} ${cx + 4} ${cy + 6} ${cx + 5.5} ${cy}`} fill="none" stroke={INK} strokeWidth={LINE} strokeLinecap="round" />
}

// A thin four-point star with deeply curved sides.
function Sparkle({ x, y, s }: { x: number; y: number; s: number }) {
  const k = s * 0.07
  return (
    <motion.path
      d={`M${x} ${y - s} Q${x + k} ${y - k} ${x + s} ${y} Q${x + k} ${y + k} ${x} ${y + s} Q${x - k} ${y + k} ${x - s} ${y} Q${x - k} ${y - k} ${x} ${y - s} Z`}
      fill="#fff"
      style={{ originX: `${x}px`, originY: `${y}px` }}
      animate={{ scale: [1, 0.7, 1], opacity: [1, 0.75, 1] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

export function PetArt({
  color = DEFAULT_PET_COLOR,
  eyes = 'open',
  mouth = 'smile',
  look = 0,
  glow = false,
}: {
  color?: string
  eyes?: Eyes
  mouth?: Mouth
  // -1..1: the face slides toward where the pet is looking.
  look?: number
  // A soft halo of its own color (off by default; the reference is flat).
  glow?: boolean
}) {
  const uid = useId().replace(/:/g, '')
  // Like the reference, the face sits off-center toward the upper right and
  // the sparkle sits in the opposite corner.
  const fx = 58 + look * 7
  const fy = 46
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: 'visible' }}>
      {glow && (
        <>
          <defs>
            <filter id={`g${uid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          <path d={PEBBLE} fill={color} opacity={0.45} filter={`url(#g${uid})`} />
        </>
      )}
      <path d={PEBBLE} fill={color} />
      <Sparkle x={30} y={69} s={11} />
      <motion.g initial={false} animate={{ x: fx - 58 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}>
        <Eye cx={fx - 10.5 - (fx - 58)} cy={fy} eyes={eyes} />
        <Eye cx={fx + 10.5 - (fx - 58)} cy={fy} eyes={eyes} />
        <MouthShape mouth={mouth} cx={56} cy={fy + 9} />
      </motion.g>
    </svg>
  )
}
