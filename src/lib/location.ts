import { getSystemLocation, isTauri } from './ipc'

export interface GeoLocation {
  lat: number
  lon: number
  city: string
}

// City name for a coordinate, via BigDataCloud's free client endpoint (no key,
// CORS-friendly). Empty string if it can't resolve.
export async function reverseCity(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    )
    const j = await res.json()
    return j.city || j.locality || j.principalSubdivision || ''
  } catch {
    return ''
  }
}

// The Windows location service — accurate, but only when location access is on.
export async function systemLocation(): Promise<GeoLocation | null> {
  if (!isTauri()) return null
  try {
    const [lat, lon] = await getSystemLocation()
    if (typeof lat === 'number' && typeof lon === 'number') {
      return { lat, lon, city: await reverseCity(lat, lon) }
    }
  } catch {
    /* location disabled, blocked, or timed out */
  }
  return null
}

// Coarse fallback from the public IP — less precise (often the ISP's city).
export async function ipLocation(): Promise<GeoLocation | null> {
  try {
    const res = await fetch('https://ipwho.is/')
    const j = await res.json()
    if (j && j.success !== false && typeof j.latitude === 'number') {
      return { lat: j.latitude, lon: j.longitude, city: j.city ?? '' }
    }
  } catch {
    /* offline */
  }
  return null
}

// Best available location: the system service first, then IP.
export async function detectLocation(): Promise<GeoLocation | null> {
  return (await systemLocation()) ?? (await ipLocation())
}
