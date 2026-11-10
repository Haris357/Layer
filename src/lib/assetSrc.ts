import { useCallback, useEffect, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}
const mimeOf = (path: string) => MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'

/**
 * The URL for an imported image/video. Tries the fast asset protocol first; if
 * that refuses the file (the Microsoft Store build's redirected AppData can
 * put it outside the allowed scope, so pictures showed as broken), it falls
 * back to reading the bytes through `read_asset` and shows them from memory.
 * Spread the result onto the <img>/<video>: `<img {...useAssetSrc(path)} />`.
 */
export function useAssetSrc(path: string | null | undefined): { src: string | undefined; onError: () => void } {
  const [blob, setBlob] = useState<string | null>(null)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    setBlob(null)
    setTried(false)
  }, [path])
  useEffect(() => () => {
    if (blob) URL.revokeObjectURL(blob)
  }, [blob])

  const onError = useCallback(() => {
    if (!path || tried) return
    setTried(true)
    invoke<ArrayBuffer>('read_asset', { assetPath: path })
      .then((buf) => setBlob(URL.createObjectURL(new Blob([buf], { type: mimeOf(path) }))))
      .catch(() => {})
  }, [path, tried])

  return { src: path ? (blob ?? convertFileSrc(path)) : undefined, onError }
}
