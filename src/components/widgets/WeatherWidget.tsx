import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WeatherLottie, sceneOf, type Scene } from './weather/WeatherLottie'
import { Tooltip } from '../Tooltip'
import { useTranslation } from 'react-i18next'
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Wind,
  MapPin,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import type { WeatherWidget as WeatherWidgetType } from '../../types/widget'
import { TextField, Segmented } from '../ui'
import { cn } from '../../lib/utils'
import { detectLocation } from '../../lib/location'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

interface CodeInfo {
  Icon: LucideIcon
  labelKey: string
}

function codeInfo(code: number): CodeInfo {
  if (code === 0) return { Icon: Sun, labelKey: 'clear' }
  if (code <= 2) return { Icon: CloudSun, labelKey: 'partlyCloudy' }
  if (code === 3) return { Icon: Cloud, labelKey: 'cloudy' }
  if (code <= 48) return { Icon: CloudFog, labelKey: 'fog' }
  if (code <= 57) return { Icon: CloudRain, labelKey: 'drizzle' }
  if (code <= 67) return { Icon: CloudRain, labelKey: 'rain' }
  if (code <= 77) return { Icon: CloudSnow, labelKey: 'snow' }
  if (code <= 82) return { Icon: CloudRain, labelKey: 'showers' }
  if (code <= 86) return { Icon: CloudSnow, labelKey: 'snowShowers' }
  return { Icon: CloudLightning, labelKey: 'thunderstorm' }
}

interface Current {
  temp: number
  code: number
  wind: number
  isDay: boolean
}

function WeatherRenderer({ widget }: { widget: WeatherWidgetType }) {
  const { t } = useTranslation()
  const [data, setData] = useState<Current | null>(null)
  const [error, setError] = useState(false)
  const fahrenheit = widget.unit === 'f'

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const units = fahrenheit
          ? '&temperature_unit=fahrenheit&wind_speed_unit=mph'
          : ''
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${widget.lat}&longitude=${widget.lon}&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=auto${units}`,
        )
        const json = await res.json()
        if (cancelled) return
        setData({
          temp: Math.round(json.current.temperature_2m),
          code: json.current.weather_code,
          wind: Math.round(json.current.wind_speed_10m),
          isDay: json.current.is_day !== 0,
        })
        setError(false)
      } catch {
        if (!cancelled) setError(true)
      }
    }
    load()
    const id = window.setInterval(load, 15 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [widget.lat, widget.lon, fahrenheit])

  const info = data ? codeInfo(data.code) : null
  const scene = data ? sceneOf(data.code, data.isDay) : null
  // A gust you'd notice: 30 km/h (≈19 mph) and up.
  const windy = !!data && data.wind >= (fahrenheit ? 19 : 30)
  const art = Math.max(56, Math.min(96, Math.round(Math.min(widget.width * 0.4, widget.height * 0.55))))

  return (
    <div className="glass relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[12px] border border-[var(--border)] p-4">
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={data ? data.temp : 'none'}
              className="text-[var(--text-primary)] tabular-nums"
              style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-2px', lineHeight: 1.1 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            >
              {data ? `${data.temp}°` : '—'}
            </motion.span>
          </AnimatePresence>
          <span className="truncate text-[var(--text-secondary)]" style={{ fontSize: 13, fontWeight: 500 }}>
            {error
              ? t('weather.renderer.unavailable')
              : info
                ? t(`weather.conditions.${info.labelKey}`)
                : t('weather.renderer.loading')}
          </span>
        </div>
        <div className="-mr-1 -mt-1 shrink-0" style={{ width: art, height: art }}>
          <AnimatePresence mode="wait" initial={false}>
            {scene ? (
              <motion.div
                key={scene}
                initial={{ opacity: 0, scale: 0.85, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
              >
                <WeatherLottie scene={scene} size={art} />
              </motion.div>
            ) : (
              <motion.div key="loading" className="flex h-full w-full items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="relative flex items-center justify-between gap-2">
        <span className="truncate text-[var(--text-primary)]" style={{ fontSize: 14, fontWeight: 600 }}>
          {widget.city}
        </span>
        {data && (
          <span
            className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 transition-colors duration-500', windy ? 'bg-sky-400/15 text-sky-300' : 'text-[var(--text-tertiary)]')}
            style={{ fontSize: 12, fontWeight: 500 }}
          >
            {windy ? <span className="-my-1"><WeatherLottie scene="wind" size={18} /></span> : <Wind size={12} strokeWidth={1.8} />}
            {data.wind} {fahrenheit ? t('weather.renderer.mph') : t('weather.renderer.kmh')}
          </span>
        )}
      </div>
    </div>
  )
}

interface GeoResult {
  name: string
  latitude: number
  longitude: number
  country?: string
  admin1?: string
}

function WeatherSettings({
  widget,
  onUpdate,
}: {
  widget: WeatherWidgetType
  onUpdate: (patch: Partial<WeatherWidgetType>) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(widget.city)
  const [results, setResults] = useState<GeoResult[]>([])
  const [locating, setLocating] = useState(false)

  const useMyLocation = async () => {
    setLocating(true)
    try {
      const loc = await detectLocation()
      if (loc) {
        onUpdate({
          city: loc.city || t('weather.settings.myLocation'),
          lat: loc.lat,
          lon: loc.lon,
        })
        setQuery(loc.city || '')
        setResults([])
      }
    } finally {
      setLocating(false)
    }
  }

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    const id = window.setTimeout(() => {
      fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          q,
        )}&count=10&language=en`,
      )
        .then((res) => res.json())
        .then((json) => {
          if (!cancelled) {
            setResults(Array.isArray(json.results) ? json.results : [])
          }
        })
        .catch(() => {
          if (!cancelled) setResults([])
        })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [query])

  return (
    <div className="flex w-[240px] flex-col gap-2">
      <Segmented
        value={widget.unit ?? 'c'}
        options={[
          { value: 'c', label: '°C' },
          { value: 'f', label: '°F' },
        ]}
        onChange={(v) => onUpdate({ unit: v as 'c' | 'f' })}
      />
      <button
        type="button"
        onClick={() => useMyLocation()}
        disabled={locating}
        className="flex items-center justify-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-60"
      >
        {locating ? (
          <Loader2 size={13} strokeWidth={2} className="animate-spin" />
        ) : (
          <MapPin size={13} strokeWidth={2} />
        )}
        {locating ? t('weather.settings.findingYou') : t('weather.settings.useMyLocation')}
      </button>
      <TextField
        value={query}
        placeholder={t('weather.settings.searchCity')}
        onChange={setQuery}
      />
      {results.length > 0 && (
        <div className="flex flex-col rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)]">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onUpdate({
                  city: r.name,
                  lat: r.latitude,
                  lon: r.longitude,
                })
                setResults([])
              }}
              className={cn(
                'px-2.5 py-1.5 text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]',
              )}
            >
              {r.name}
              {r.admin1 ? `, ${r.admin1}` : ''}
              {r.country ? ` · ${r.country}` : ''}
            </button>
          ))}
        </div>
      )}
      <AllConditions />
    </div>
  )
}

// Every scene the widget can show, so you can see them all without waiting
// for the weather. Hover one for its name.
const GALLERY: { scene: Scene; label: string; night?: boolean }[] = [
  { scene: 'clear-day', label: 'weather.conditions.clear' },
  { scene: 'clear-night', label: 'weather.conditions.clear', night: true },
  { scene: 'partly-day', label: 'weather.conditions.partlyCloudy' },
  { scene: 'partly-night', label: 'weather.conditions.partlyCloudy', night: true },
  { scene: 'cloudy', label: 'weather.conditions.cloudy' },
  { scene: 'fog', label: 'weather.conditions.fog' },
  { scene: 'drizzle', label: 'weather.conditions.drizzle' },
  { scene: 'rain', label: 'weather.conditions.rain' },
  { scene: 'snow', label: 'weather.conditions.snow' },
  { scene: 'storm', label: 'weather.conditions.thunderstorm' },
  { scene: 'wind', label: 'weather.settings.windy' },
]

function AllConditions() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{t('weather.settings.allConditions')}</span>
      <div className="grid grid-cols-4 gap-1">
        {GALLERY.map((g) => (
          <Tooltip key={g.scene} label={`${t(g.label)}${g.night ? ` · ${t('weather.settings.night')}` : ''}`} side="top">
            <div className="flex aspect-square w-full items-center justify-center rounded-[8px] bg-[var(--fill-1)]">
              <WeatherLottie scene={g.scene} size={40} />
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

export const weatherDefinition: WidgetDefinition<WeatherWidgetType> = {
  type: 'weather',
  label: 'Weather',
  icon: CloudSun,
  enabled: true,
  minSize: { width: 210, height: 150 },
  maxSize: { width: 380, height: 300 },
  create: async (x, y) => {
    // Default to the user's actual location so a new widget shows local weather
    // instead of a hardcoded city. Falls back to London if detection fails.
    const loc = await detectLocation().catch(() => null)
    return {
      type: 'weather',
      x,
      y,
      width: 240,
      height: 180,
      locked: false,
      city: loc?.city || 'London',
      lat: loc?.lat ?? 51.5072,
      lon: loc?.lon ?? -0.1276,
      unit: 'c',
    }
  },
  Renderer: WeatherRenderer,
  Settings: WeatherSettings,
}
