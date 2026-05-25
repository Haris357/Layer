import { useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { systemLocation, ipLocation } from '../lib/location'

type WeatherKind = 'clear' | 'rain' | 'snow'

function kindFromCode(code: number): WeatherKind {
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  return 'clear'
}

function useWeatherKind(active: boolean): WeatherKind {
  const [kind, setKind] = useState<WeatherKind>('clear')
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const load = async () => {
      const loc = (await systemLocation()) ?? (await ipLocation())
      if (!loc || cancelled) return
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=weather_code`,
        )
        const j = await res.json()
        if (!cancelled && typeof j?.current?.weather_code === 'number') {
          setKind(kindFromCode(j.current.weather_code))
        }
      } catch {
        /* keep clear */
      }
    }
    load()
    const id = window.setInterval(load, 15 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [active])
  return kind
}

function Precip({ kind }: { kind: 'rain' | 'snow' }) {
  // Stable random drops so they don't reshuffle every render.
  const drops = useMemo(
    () =>
      Array.from({ length: kind === 'rain' ? 60 : 40 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * (kind === 'rain' ? 1.2 : 6),
        dur:
          kind === 'rain'
            ? 0.7 + Math.random() * 0.6
            : 6 + Math.random() * 6,
        drift: (Math.random() - 0.5) * 40,
        scale: 0.7 + Math.random() * 0.7,
      })),
    [kind],
  )
  return (
    <div className={`ambient-precip ambient-${kind}`}>
      {drops.map((d, i) => (
        <span
          key={i}
          style={{
            left: `${d.left}%`,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.dur}s`,
            ['--drift' as string]: `${d.drift}px`,
            transform: `scale(${d.scale})`,
          }}
        />
      ))}
    </div>
  )
}

// A subtle living layer behind the canvas: slowly drifting colour clouds, plus
// gentle rain/snow that follows your local weather. Non-interactive.
export function AmbientBackground() {
  const enabled = useSettingsStore((s) => s.ambientEffects)
  const kind = useWeatherKind(enabled)
  if (!enabled) return null
  return (
    <div className="ambient-root" aria-hidden>
      <div className="ambient-blob a" />
      <div className="ambient-blob b" />
      <div className="ambient-blob c" />
      {kind === 'rain' && <Precip kind="rain" />}
      {kind === 'snow' && <Precip kind="snow" />}
    </div>
  )
}
