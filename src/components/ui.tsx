import { cn } from '../lib/utils'

interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
}

export function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[20px] w-[34px] rounded-full transition-all duration-200',
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--fill-3)]',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[16px] w-[16px] rounded-full transition-all duration-200',
          checked
            ? 'left-[16px] bg-[var(--on-accent)]'
            : 'left-[2px] bg-[var(--text-tertiary)]',
        )}
      />
    </button>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="flex gap-1 rounded-[8px] bg-[var(--fill-1)] p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-[6px] px-2 py-1 text-[12px] font-medium transition-all duration-200',
            value === opt.value
              ? 'bg-[var(--accent)] text-[var(--on-accent)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}

export function Slider({ value, min, max, step = 1, onChange }: SliderProps) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full"
    />
  )
}

interface TextFieldProps {
  value: string
  placeholder?: string
  maxLength?: number
  onChange: (value: string) => void
  onBlur?: () => void
}

export function TextField({
  value,
  placeholder,
  maxLength,
  onChange,
  onBlur,
}: TextFieldProps) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors focus:border-[var(--border-strong)]"
    />
  )
}

interface FieldRowProps {
  label: string
  children: React.ReactNode
}

export function FieldRow({ label, children }: FieldRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </div>
  )
}
