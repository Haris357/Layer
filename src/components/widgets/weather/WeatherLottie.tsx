import { useEffect, useRef } from 'react'
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light'

// Weather animations: Meteocons by Bas Milius (MIT, src/assets/weather-lottie,
// licence alongside), played with lottie-web's SVG-only light player. Each
// file loads on first use.

export type Scene = 'clear-day' | 'clear-night' | 'partly-day' | 'partly-night' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm' | 'wind'

export function sceneOf(code: number, isDay: boolean): Scene {
  if (code === 0) return isDay ? 'clear-day' : 'clear-night'
  if (code <= 2) return isDay ? 'partly-day' : 'partly-night'
  if (code === 3) return 'cloudy'
  if (code <= 48) return 'fog'
  if (code <= 57) return 'drizzle'
  if (code <= 67) return 'rain'
  if (code <= 77) return 'snow'
  if (code <= 82) return 'rain'
  if (code <= 86) return 'snow'
  return 'storm'
}

const FILES = import.meta.glob('../../../assets/weather-lottie/*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>
const cache = new Map<Scene, Promise<unknown>>()
const load = (scene: Scene) => {
  let p = cache.get(scene)
  if (!p) {
    const f = FILES[`../../../assets/weather-lottie/${scene}.json`]
    p = f ? f() : Promise.reject(new Error(`no animation for ${scene}`))
    cache.set(scene, p)
  }
  return p
}

export function WeatherLottie({ scene, size, play = true }: { scene: Scene; size: number; play?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const anim = useRef<AnimationItem | null>(null)

  useEffect(() => {
    let dead = false
    load(scene)
      .then((data) => {
        if (dead || !box.current) return
        anim.current = lottie.loadAnimation({
          container: box.current,
          renderer: 'svg',
          loop: true,
          autoplay: play,
          // lottie mutates the data it plays, so each player gets its own copy
          animationData: structuredClone(data),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true },
        })
      })
      .catch(() => {})
    return () => {
      dead = true
      anim.current?.destroy()
      anim.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useEffect(() => {
    if (play) anim.current?.play()
    else anim.current?.pause()
  }, [play])

  return <div ref={box} style={{ width: size, height: size }} />
}
