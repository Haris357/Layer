import { useEffect, useState } from 'react'
import { ArrowLeftRight, Repeat } from 'lucide-react'
import type { ConverterWidget as ConverterWidgetType } from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { cn } from '../../lib/utils'
import { Menu } from '../Menu'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

type Category = ConverterWidgetType['category']

const LENGTH: Record<string, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  mi: 1609.344,
}

const WEIGHT: Record<string, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  t: 1_000_000,
  oz: 28.3495,
  lb: 453.592,
}

const TEMP = ['C', 'F', 'K']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'CNY']

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'length', label: 'Length' },
  { key: 'weight', label: 'Weight' },
  { key: 'temperature', label: 'Temp' },
  { key: 'currency', label: 'Money' },
]

function unitsFor(category: Category): string[] {
  if (category === 'length') return Object.keys(LENGTH)
  if (category === 'weight') return Object.keys(WEIGHT)
  if (category === 'temperature') return TEMP
  return CURRENCIES
}

function convert(
  category: Category,
  from: string,
  to: string,
  value: number,
  rates: Record<string, number>,
): number {
  if (!isFinite(value)) return 0
  if (category === 'temperature') {
    const c = from === 'C' ? value : from === 'F' ? ((value - 32) * 5) / 9 : value - 273.15
    return to === 'C' ? c : to === 'F' ? (c * 9) / 5 + 32 : c + 273.15
  }
  if (category === 'currency') {
    if (from === to) return value
    const r = rates[to]
    return r === undefined ? 0 : value * r
  }
  const table = category === 'length' ? LENGTH : WEIGHT
  const f = table[from] ?? 1
  const t = table[to] ?? 1
  return (value * f) / t
}

function ConverterRenderer({ widget }: { widget: ConverterWidgetType }) {
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const [value, setValue] = useState('1')
  const [rates, setRates] = useState<Record<string, number>>({})

  useEffect(() => {
    if (widget.category !== 'currency') return
    let cancelled = false
    fetch(`https://api.frankfurter.app/latest?from=${widget.from}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j && j.rates) setRates(j.rates)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [widget.category, widget.from])

  const units = unitsFor(widget.category)
  const num = parseFloat(value)
  const result = convert(widget.category, widget.from, widget.to, num, rates)
  const resultStr = isFinite(result)
    ? result.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : '—'

  const setCategory = (category: Category) => {
    const u = unitsFor(category)
    updateWidget(widget.id, {
      category,
      from: u[0] ?? '',
      to: u[1] ?? u[0] ?? '',
    })
  }

  const swap = () => updateWidget(widget.id, { from: widget.to, to: widget.from })

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const unitOptions = units.map((u) => ({ value: u, label: u }))

  return (
    <div className="glass flex h-full w-full flex-col gap-2.5 overflow-hidden rounded-[12px] border border-[var(--border)] p-3">
      <div className="flex gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={cn(
              'flex-1 rounded-[7px] py-1 text-[11px] font-semibold transition-colors',
              widget.category === c.key
                ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--fill-2)]',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onMouseDown={stop}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          className="min-w-0 flex-1 rounded-[7px] border border-[var(--border)] bg-[var(--fill-1)] px-2 py-1.5 text-[14px] font-semibold text-[var(--text-primary)] outline-none"
        />
        <Menu<string>
          value={widget.from}
          options={unitOptions}
          onChange={(v) => updateWidget(widget.id, { from: v })}
          className="min-w-0 flex-1"
        />
      </div>

      <button
        type="button"
        onClick={swap}
        className="flex items-center justify-center gap-1.5 self-center rounded-full px-2 py-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeftRight size={13} />
      </button>

      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center rounded-[7px] bg-[var(--fill-2)] px-2 py-1.5">
          <span
            className="truncate text-[14px] font-bold text-[var(--text-primary)]"
            title={resultStr}
          >
            {resultStr}
          </span>
        </div>
        <Menu<string>
          value={widget.to}
          options={unitOptions}
          onChange={(v) => updateWidget(widget.id, { to: v })}
          className="min-w-0 flex-1"
        />
      </div>
    </div>
  )
}

export const converterDefinition: WidgetDefinition<ConverterWidgetType> = {
  type: 'converter',
  label: 'Converter',
  icon: Repeat,
  enabled: true,
  minSize: { width: 230, height: 180 },
  maxSize: { width: 380, height: 280 },
  create: (x, y) => ({
    type: 'converter',
    x,
    y,
    width: 270,
    height: 200,
    locked: false,
    category: 'length',
    from: 'm',
    to: 'ft',
  }),
  Renderer: ConverterRenderer,
}
