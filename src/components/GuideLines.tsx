import { useCanvasStore } from '../store/canvasStore'

export function GuideLines() {
  const guides = useCanvasStore((s) => s.guides)

  if (guides.v.length === 0 && guides.h.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[8000]">
      {guides.v.map((x, i) => (
        <div
          key={`v${i}`}
          className="absolute bottom-0 top-0"
          style={{ left: x, width: 1, background: 'var(--accent)', opacity: 0.65 }}
        />
      ))}
      {guides.h.map((y, i) => (
        <div
          key={`h${i}`}
          className="absolute left-0 right-0"
          style={{ top: y, height: 1, background: 'var(--accent)', opacity: 0.65 }}
        />
      ))}
    </div>
  )
}
