import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, RotateCcw, Video } from 'lucide-react'
import type { CameraWidget as CameraWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import { FieldRow, Toggle } from '../ui'
import { Tooltip } from '../Tooltip'
import { cn } from '../../lib/utils'

type CamState =
  | { kind: 'requesting' }
  | { kind: 'granted'; stream: MediaStream }
  | { kind: 'denied' }
  | { kind: 'no-camera' }
  | { kind: 'error' }

// Live webcam mirror. Zero Rust — getUserMedia runs straight in the webview.
// The one real gotcha: this window is always WS_EX_NOACTIVATE and pinned to
// the bottom of the z-order (see window.rs), so WebView2's native permission
// prompt renders as ordinary in-page content rather than a real OS dialog —
// it still works through the same click-through hit-region path every other
// widget interaction uses, it just won't visually look like a browser popup.
function useCameraStream(deviceId: string | undefined, tick: number): CamState {
  const [state, setState] = useState<CamState>({ kind: 'requesting' })

  useEffect(() => {
    let cancelled = false
    let activeStream: MediaStream | null = null
    setState({ kind: 'requesting' })

    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ kind: 'error' })
      return
    }

    navigator.mediaDevices
      .getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        activeStream = stream
        setState({ kind: 'granted', stream })
      })
      .catch((err: DOMException) => {
        if (cancelled) return
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          setState({ kind: 'denied' })
        } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
          setState({ kind: 'no-camera' })
        } else {
          setState({ kind: 'error' })
        }
      })

    return () => {
      cancelled = true
      activeStream?.getTracks().forEach((t) => t.stop())
    }
  }, [deviceId, tick])

  return state
}

function CameraRenderer({ widget }: { widget: CameraWidgetType }) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [retryTick, setRetryTick] = useState(0)
  const state = useCameraStream(widget.deviceId, retryTick)
  const mirrored = widget.mirrored !== false

  useEffect(() => {
    if (state.kind !== 'granted' || !videoRef.current) return
    videoRef.current.srcObject = state.stream
  }, [state])

  return (
    <div className="glass flex h-full w-full flex-col overflow-hidden rounded-[16px] border border-[var(--border)]">
      {state.kind === 'granted' ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
          style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
          {state.kind === 'requesting' && (
            <>
              <Camera size={20} strokeWidth={1.75} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {t('camera.requesting')}
              </span>
            </>
          )}
          {state.kind === 'denied' && (
            <>
              <Video size={20} strokeWidth={1.75} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] leading-snug text-[var(--text-tertiary)]">
                {t('camera.denied')}
              </span>
              <button
                type="button"
                onClick={() => setRetryTick((n) => n + 1)}
                className="mt-1 flex items-center gap-1 rounded-[7px] bg-[var(--fill-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--fill-3)]"
              >
                <RotateCcw size={11} strokeWidth={2} />
                {t('camera.retry')}
              </button>
            </>
          )}
          {state.kind === 'no-camera' && (
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {t('camera.noCamera')}
            </span>
          )}
          {state.kind === 'error' && (
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {t('camera.error')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function CameraSettings({
  widget,
  onUpdate,
}: {
  widget: CameraWidgetType
  onUpdate: (patch: Partial<CameraWidgetType>) => void
}) {
  const { t } = useTranslation()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((all) => {
        if (cancelled) return
        setDevices(all.filter((d) => d.kind === 'videoinput'))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex w-[220px] flex-col gap-3">
      {devices.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            {t('camera.device')}
          </span>
          <div className="flex flex-col gap-1">
            {devices.map((d, i) => {
              const active = widget.deviceId
                ? widget.deviceId === d.deviceId
                : i === 0
              return (
                <Tooltip key={d.deviceId} label={d.label || t('camera.title')} side="top">
                  <button
                    type="button"
                    onClick={() => onUpdate({ deviceId: d.deviceId })}
                    className={cn(
                      'w-full truncate rounded-[9px] px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors',
                      active
                        ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                        : 'bg-[var(--fill-1)] text-[var(--text-primary)] hover:bg-[var(--fill-2)]',
                    )}
                  >
                    {d.label || t('camera.title')}
                  </button>
                </Tooltip>
              )
            })}
          </div>
        </div>
      )}

      <FieldRow label={t('camera.mirror')}>
        <Toggle
          checked={widget.mirrored !== false}
          onChange={(v) => onUpdate({ mirrored: v })}
        />
      </FieldRow>
    </div>
  )
}

export const cameraDefinition: WidgetDefinition<CameraWidgetType> = {
  type: 'camera',
  label: 'Camera',
  icon: Camera,
  enabled: true,
  minSize: { width: 140, height: 110 },
  maxSize: { width: 480, height: 380 },
  create: (x, y) => ({
    type: 'camera',
    x,
    y,
    width: 240,
    height: 180,
    locked: false,
    mirrored: true,
  }),
  Renderer: CameraRenderer,
  Settings: CameraSettings,
}
