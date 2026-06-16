import { useEffect, useState } from 'react'
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
  label: string
}

function codeInfo(code: number): CodeInfo {
  if (code === 0) return { Icon: Sun, label: 'Clear' }
  if (code <= 2) return { Icon: CloudSun, label: 'Partly cloudy' }
  if (code === 3) return { Icon: Cloud, label: 'Cloudy' }
  if (code <= 48) return { Icon: CloudFog, label: 'Fog' }
  if (code <= 57) return { Icon: CloudRain, label: 'Drizzle' }
  if (code <= 67) return { Icon: CloudRain, label: 'Rain' }
  if (code <= 77) return { Icon: CloudSnow, label: 'Snow' }
  if (code <= 82) return { Icon: CloudRain, label: 'Showers' }
  if (code <= 86) return { Icon: CloudSnow, label: 'Snow showers' }
  return { Icon: CloudLightning, label: 'Thunderstorm' }
}

interface Current {
  temp: number
  code: number
  wind: number
}

function WeatherRenderer({ widget }: { widget: WeatherWidgetType }) {
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
          `https://api.open-meteo.com/v1/forecast?latitude=${widget.lat}&longitude=${widget.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto${units}`,
        )
        const json = await res.json()
        if (cancelled) return
        setData({
          temp: Math.round(json.current.temperature_2m),
          code: json.current.weather_code,
          wind: Math.round(json.current.wind_speed_10m),
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

  return (
    <div className="glass flex h-full w-full flex-col justify-between rounded-[12px] border border-[var(--border)] p-4">
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span
            className="text-[var(--text-primary)]"
            style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-2px' }}
          >
            {data ? `${data.temp}°` : '—'}
          </span>
          <span
            className="text-[var(--text-secondary)]"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            {error ? 'Unavailable' : info ? info.label : 'Loading…'}
          </span>
        </div>
        {info && (
          <info.Icon
            size={40}
            strokeWidth={1.5}
            className="text-[var(--text-primary)]"
          />
        )}
      </div>
      <div className="flex items-center justify-between">
        <span
          className="truncate text-[var(--text-primary)]"
          style={{ fontSize: 14, fontWeight: 600 }}
        >
          {widget.city}
        </span>
        {data && (
          <span
            className="flex items-center gap-1 text-[var(--text-tertiary)]"
            style={{ fontSize: 12, fontWeight: 500 }}
          >
            <Wind size={12} strokeWidth={1.8} />
            {data.wind} {fahrenheit ? 'mph' : 'km/h'}
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
  const [query, setQuery] = useState(widget.city)
  const [results, setResults] = useState<GeoResult[]>([])
  const [locating, setLocating] = useState(false)

  const useMyLocation = async () => {
    setLocating(true)
    try {
      const loc = await detectLocation()
      if (loc) {
        onUpdate({
          city: loc.city || 'My location',
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
        {locating ? 'Finding you…' : 'Use my location'}
      </button>
      <TextField
        value={query}
        placeholder="Search a city…"
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
