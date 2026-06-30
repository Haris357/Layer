import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type LucideIcon,
} from 'lucide-react'
import {
  getNowPlaying,
  getScreensaverTheme,
  loadSpaces,
  type NowPlaying,
} from '../lib/ipc'

type SsTheme = 'ambient' | 'minimal' | 'quote'

const QUOTES = [
  'Breathe.',
  'Stay present.',
  'One thing at a time.',
  'Rest is productive.',
  'Be where your feet are.',
  'Slow is smooth, smooth is fast.',
  'Almost everything works again if you unplug it.',
]
import { ipLocation, systemLocation, type GeoLocation } from '../lib/location'
import { dateLocale } from '../lib/locale'
import './screensaver.css'

// Returns an i18n key under the `screensaver` namespace; resolved via t() at
// render time (this module-level helper can't call the hook itself).
function greetingKey(h: number): string {
  if (h < 5) return 'night'
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 22) return 'evening'
  return 'night'
}

// Same weather-code mapping the Weather widget uses. `labelKey` is an i18n key
// under the `screensaver` namespace, resolved via t() at render time.
function codeInfo(code: number): { Icon: LucideIcon; labelKey: string } {
  if (code === 0) return { Icon: Sun, labelKey: 'wClear' }
  if (code <= 2) return { Icon: CloudSun, labelKey: 'wPartlyCloudy' }
  if (code === 3) return { Icon: Cloud, labelKey: 'wCloudy' }
  if (code <= 48) return { Icon: CloudFog, labelKey: 'wFog' }
  if (code <= 57) return { Icon: CloudRain, labelKey: 'wDrizzle' }
  if (code <= 67) return { Icon: CloudRain, labelKey: 'wRain' }
  if (code <= 77) return { Icon: CloudSnow, labelKey: 'wSnow' }
  if (code <= 82) return { Icon: CloudRain, labelKey: 'wShowers' }
  if (code <= 86) return { Icon: CloudSnow, labelKey: 'wSnowShowers' }
  return { Icon: CloudLightning, labelKey: 'wThunderstorm' }
}

interface Weather {
  temp: number
  code: number
  city: string
}

// The user's own Weather widget location, read from the saved templates file
// (works even in the screensaver's separate webview).
async function widgetLocation(): Promise<GeoLocation | null> {
  try {
    const raw = await loadSpaces()
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      templates?: Array<{ widgets?: Array<Record<string, unknown>> }>
    }
    for (const t of parsed.templates ?? []) {
      const w = (t.widgets ?? []).find(
        (x) =>
          x.type === 'weather' &&
          typeof x.lat === 'number' &&
          typeof x.lon === 'number',
      )
      if (w) {
        return {
          lat: w.lat as number,
          lon: w.lon as number,
          city: (w.city as string) ?? '',
        }
      }
    }
  } catch {
    /* fall through */
  }
  return null
}

// Most accurate first: the Windows location service, then a Weather widget the
// user placed, then a coarse IP guess.
async function locate(): Promise<GeoLocation | null> {
  return (
    (await systemLocation()) ??
    (await widgetLocation()) ??
    (await ipLocation())
  )
}

function useWeather(active: boolean): Weather | null {
  const [data, setData] = useState<Weather | null>(null)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const load = async () => {
      const loc = await locate()
      if (!loc || cancelled) return
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code`,
        )
        const j = await res.json()
        if (cancelled) return
        setData({
          temp: Math.round(j.current.temperature_2m),
          code: j.current.weather_code,
          city: loc.city,
        })
      } catch {
        /* keep whatever we had */
      }
    }
    load()
    const id = window.setInterval(load, 15 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [active])
  return data
}

function useNowPlaying(active: boolean): NowPlaying | null {
  const [np, setNp] = useState<NowPlaying | null>(null)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const poll = () => {
      getNowPlaying()
        .then((d) => !cancelled && setNp(d))
        .catch(() => {})
    }
    poll()
    const id = window.setInterval(poll, 3000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [active])
  return np
}

// Calm, self-contained ambient view shown when Layer runs as the Windows
// screensaver. Any key or mouse activity dismisses it.
export function Screensaver() {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => new Date())
  const [theme, setTheme] = useState<SsTheme>('ambient')
  const [quote, setQuote] = useState(
    () => QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? QUOTES[0],
  )

  // Which style to render (persisted by the main app to a file).
  useEffect(() => {
    getScreensaverTheme()
      .then((t) => {
        if (t === 'minimal' || t === 'quote' || t === 'ambient') setTheme(t)
      })
      .catch(() => {})
  }, [])

  // Tick once a second — enough to keep the minute (and blinking colon) live.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Rotate the quote (quote theme only).
  useEffect(() => {
    if (theme !== 'quote') return
    const id = window.setInterval(() => {
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? QUOTES[0])
    }, 12000)
    return () => window.clearInterval(id)
  }, [theme])

  // Dismiss on real input. We ignore the first mouse event (Windows often
  // emits a synthetic move at launch) and only quit once the cursor actually
  // travels a little.
  useEffect(() => {
    const quit = () => {
      invoke('exit_screensaver').catch(() => {})
    }
    let origin: { x: number; y: number } | null = null
    const onMove = (e: MouseEvent) => {
      if (origin === null) {
        origin = { x: e.screenX, y: e.screenY }
        return
      }
      if (Math.abs(e.screenX - origin.x) > 8 || Math.abs(e.screenY - origin.y) > 8) {
        quit()
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', quit)
    window.addEventListener('keydown', quit)
    window.addEventListener('wheel', quit, { passive: true })
    window.addEventListener('touchstart', quit, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', quit)
      window.removeEventListener('keydown', quit)
      window.removeEventListener('wheel', quit)
      window.removeEventListener('touchstart', quit)
    }
  }, [])

  const h24 = now.getHours()
  const minutes = String(now.getMinutes()).padStart(2, '0')
  let h12 = h24 % 12
  if (h12 === 0) h12 = 12
  const ampm = h24 < 12 ? 'AM' : 'PM'
  const date = now.toLocaleDateString(dateLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const ambient = theme === 'ambient'
  const weather = useWeather(ambient)
  const np = useNowPlaying(ambient)
  const wInfo = weather ? codeInfo(weather.code) : null
  const playing = !!(np?.hasSession && np.title)

  const hint = (
    <div className="ss-hint">{t('screensaver.exitHint')}</div>
  )

  // ── Minimal: stark, flat black, one huge thin clock anchored bottom-left ──
  if (theme === 'minimal') {
    return (
      <div className="ss-root ss-minimal">
        <div className="ss-min">
          <div className="ss-min-time">
            {h12}
            <span className="ss-colon">:</span>
            {minutes}
            <span className="ss-min-ampm">{ampm}</span>
          </div>
          <div className="ss-min-date">{date}</div>
        </div>
        {hint}
      </div>
    )
  }

  // ── Quote: a serif line is the hero; the time sits small above it ──
  if (theme === 'quote') {
    return (
      <div className="ss-root ss-quote-theme">
        <div className="ss-aurora a" />
        <div className="ss-aurora b" />
        <div className="ss-aurora c" />
        <div className="ss-content">
          <div className="ss-q-time">
            {h12}:{minutes} {ampm}
          </div>
          <p className="ss-q-text">“{quote}”</p>
          <div className="ss-q-date">{date}</div>
        </div>
        <div className="ss-mark">Layer</div>
        {hint}
      </div>
    )
  }

  // ── Ambient (default): centered, info-rich, drifting aurora ──
  return (
    <div className="ss-root">
      <div className="ss-aurora a" />
      <div className="ss-aurora b" />
      <div className="ss-aurora c" />

      <div className="ss-content">
        <p className="ss-greeting">{t(`screensaver.${greetingKey(h24)}`)}</p>
        <h1 className="ss-time">
          {h12}
          <span className="ss-colon">:</span>
          {minutes}
          <span className="ss-ampm">{ampm}</span>
        </h1>
        <p className="ss-date">{date}</p>

        {weather && wInfo && (
          <div className="ss-weather">
            <wInfo.Icon size={26} strokeWidth={1.5} />
            <span className="ss-temp">{weather.temp}°</span>
            <span>{t(`screensaver.${wInfo.labelKey}`)}</span>
            {weather.city && (
              <>
                <span className="ss-dot">·</span>
                <span>{weather.city}</span>
              </>
            )}
          </div>
        )}

        {playing && (
          <div className="ss-np">
            <span className="ss-eq" data-playing={np!.playing}>
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="ss-np-text">
              <b>{np!.title}</b>
              {np!.artist ? ` — ${np!.artist}` : ''}
            </span>
          </div>
        )}
      </div>

      <div className="ss-mark">Layer</div>
      {hint}
    </div>
  )
}
