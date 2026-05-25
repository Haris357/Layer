// Focus sounds for the Pomodoro. Recorded loops (rain, ocean, forest,
// fireplace) play from bundled files; the noise colours (brown/pink/white) are
// synthesized via Web Audio (no files needed). One sound plays at a time.

export type AmbientSound =
  | 'none'
  | 'rain'
  | 'ocean'
  | 'forest'
  | 'fireplace'
  | 'brown'
  | 'pink'
  | 'white'

// Recorded loops live in public/sounds and are served from the app root.
const FILES: Partial<Record<AmbientSound, string>> = {
  rain: '/sounds/rain.mp3',
  ocean: '/sounds/ocean.mp3',
  forest: '/sounds/forest.mp3',
  fireplace: '/sounds/fireplace.mp3',
}

export const AMBIENT_SOUNDS: { value: AmbientSound; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'rain', label: 'Rain' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'forest', label: 'Forest' },
  { value: 'fireplace', label: 'Fire' },
  { value: 'brown', label: 'Brown' },
  { value: 'pink', label: 'Pink' },
  { value: 'white', label: 'White' },
]

const SOFTEN = 0.8 // overall level trim so nothing is piercing

// --- recorded loops ---
let audioEl: HTMLAudioElement | null = null

// --- synthesized noise ---
let ctx: AudioContext | null = null
let src: AudioBufferSourceNode | null = null
let gain: GainNode | null = null

function makeNoiseBuffer(context: AudioContext, kind: AmbientSound): AudioBuffer {
  const len = context.sampleRate * 4
  const buf = context.createBuffer(1, len, context.sampleRate)
  const d = buf.getChannelData(0)
  if (kind === 'brown') {
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    }
  } else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
  } else {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1 // white
  }
  return buf
}

function playSynth(kind: AmbientSound, volume: number) {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  src = ctx.createBufferSource()
  src.buffer = makeNoiseBuffer(ctx, kind)
  src.loop = true

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.7
  lp.frequency.value = kind === 'brown' ? 1200 : kind === 'pink' ? 4200 : 2600

  gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(volume * SOFTEN, ctx.currentTime + 0.4)

  src.connect(lp)
  lp.connect(gain)
  gain.connect(ctx.destination)
  src.start()
}

export function playAmbient(kind: AmbientSound, volume: number): void {
  stopAmbient()
  if (kind === 'none') return

  const file = FILES[kind]
  if (file) {
    audioEl = new Audio(file)
    audioEl.loop = true
    audioEl.volume = Math.max(0, Math.min(1, volume))
    audioEl.play().catch(() => {})
    return
  }
  playSynth(kind, volume)
}

export function setAmbientVolume(volume: number): void {
  const v = Math.max(0, Math.min(1, volume))
  if (audioEl) audioEl.volume = v
  if (gain && ctx) gain.gain.setTargetAtTime(v * SOFTEN, ctx.currentTime, 0.05)
}

export function stopAmbient(): void {
  if (audioEl) {
    try {
      audioEl.pause()
    } catch {
      /* ignore */
    }
    audioEl.src = ''
    audioEl = null
  }
  try {
    src?.stop()
  } catch {
    /* already stopped */
  }
  src?.disconnect()
  gain?.disconnect()
  src = null
  gain = null
}
