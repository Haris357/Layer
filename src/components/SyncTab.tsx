import { useEffect, useRef, useState } from 'react'
import { Cloud, Check, ShieldCheck, Loader2 } from 'lucide-react'
import { useSyncStore } from '../store/syncStore'
import { useSettingsStore } from '../store/settingsStore'
import { Toggle, FieldRow, TextField } from './ui'

type OtpState = 'idle' | 'error' | 'success'

// Segmented 6-box code input: auto-advances, supports paste, auto-submits when
// full, and shows a red/green border on failure/success.
function OtpInput({
  length = 6,
  state,
  onChange,
  onComplete,
}: {
  length?: number
  state: OtpState
  onChange: (code: string) => void
  onComplete: (code: string) => void
}) {
  const [digits, setDigits] = useState<string[]>(() =>
    Array(length).fill(''),
  )
  const refs = useRef<(HTMLInputElement | null)[]>([])

  // Reset and refocus when a verification fails.
  useEffect(() => {
    if (state === 'error') {
      setDigits(Array(length).fill(''))
      onChange('')
      refs.current[0]?.focus()
    }
  }, [state, length, onChange])

  const commit = (next: string[]) => {
    setDigits(next)
    const joined = next.join('')
    onChange(joined)
    if (next.every((d) => d) && joined.length === length) onComplete(joined)
  }

  const handleChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, '')
    if (!v) {
      const next = [...digits]
      next[i] = ''
      commit(next)
      return
    }
    const next = [...digits]
    next[i] = v[v.length - 1] as string
    commit(next)
    if (i < length - 1) refs.current[i + 1]?.focus()
  }

  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      const next = [...digits]
      next[i - 1] = ''
      commit(next)
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < length - 1)
      refs.current[i + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, length)
    if (!text) return
    const next = Array(length)
      .fill('')
      .map((_, idx) => text[idx] ?? '')
    commit(next)
    refs.current[Math.min(text.length, length) - 1]?.focus()
  }

  // Only override the border for error/success — idle keeps the default +
  // focus border from the classes.
  const stateBorder =
    state === 'error'
      ? 'var(--danger)'
      : state === 'success'
        ? '#2c8a4a'
        : undefined

  return (
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={d}
          inputMode="numeric"
          maxLength={1}
          autoFocus={i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="h-12 w-11 rounded-[10px] border border-[var(--border)] bg-[var(--fill-1)] text-center text-[20px] font-semibold text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--text-secondary)]"
          style={stateBorder ? { borderColor: stateBorder } : undefined}
        />
      ))}
    </div>
  )
}

const btn =
  'rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-50'
const primaryBtn =
  'rounded-[8px] bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[var(--on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50'

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function ConsentPanel() {
  const consented = useSettingsStore((s) => s.cloudSyncConsented)
  const setConsented = useSettingsStore((s) => s.setCloudSyncConsented)
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--fill-1)] p-4">
      <div className="flex items-center gap-2 text-[var(--text-primary)]">
        <ShieldCheck size={16} strokeWidth={1.8} />
        <span className="text-[13px] font-semibold">What Cloud Sync saves</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-[12px] leading-relaxed">
        <div>
          <div className="mb-1 font-semibold text-[var(--text-secondary)]">
            Synced
          </div>
          <ul className="flex flex-col gap-1 text-[var(--text-secondary)]">
            <li>Spaces &amp; widget layout</li>
            <li>Sizes &amp; positions</li>
            <li>Colors &amp; light/dark</li>
            <li>Widget settings</li>
          </ul>
        </div>
        <div>
          <div className="mb-1 font-semibold text-[var(--text-secondary)]">
            Stays on this device
          </div>
          <ul className="flex flex-col gap-1 text-[var(--text-tertiary)]">
            <li>Notes &amp; sticky text</li>
            <li>To-do item text</li>
            <li>Clipboard &amp; inbox</li>
            <li>Shelf files &amp; local paths</li>
          </ul>
        </div>
      </div>
      <label className="mt-1 flex cursor-pointer items-center gap-2.5">
        <button
          type="button"
          onClick={() => setConsented(!consented)}
          className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors"
          style={{
            borderColor: consented ? 'var(--accent)' : 'var(--border-strong)',
            background: consented ? 'var(--accent)' : 'transparent',
          }}
        >
          {consented && (
            <Check size={13} strokeWidth={3} color="var(--on-accent)" />
          )}
        </button>
        <span className="text-[12px] text-[var(--text-secondary)]">
          I understand and want to enable Cloud Sync.
        </span>
      </label>
    </div>
  )
}

function SignIn() {
  const { status, error, pendingEmail, requestOtp, verifyOtp } = useSyncStore()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [otpState, setOtpState] = useState<OtpState>('idle')

  const sending = status === 'sending'
  const verifying = status === 'verifying'

  const submitCode = async (value: string) => {
    if (value.length !== 6 || verifying) return
    setOtpState('idle')
    const ok = await verifyOtp(value)
    setOtpState(ok ? 'success' : 'error')
  }

  return (
    <div className="flex flex-col gap-3">
      {!pendingEmail ? (
        <>
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">
            Email
          </span>
          <TextField
            value={email}
            placeholder="you@example.com"
            onChange={setEmail}
          />
          <button
            type="button"
            disabled={sending || email.trim().length < 6}
            onClick={() => requestOtp(email.trim())}
            className={primaryBtn}
          >
            {sending ? 'Sending…' : 'Send code'}
          </button>
        </>
      ) : (
        <>
          <span className="text-center text-[12px] font-medium text-[var(--text-secondary)]">
            Enter the 6-digit code sent to{' '}
            <span className="text-[var(--text-primary)]">{pendingEmail}</span>
          </span>
          <OtpInput
            state={otpState}
            onChange={(v) => {
              setCode(v)
              if (otpState !== 'idle') setOtpState('idle')
            }}
            onComplete={submitCode}
          />
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={verifying || code.length !== 6}
              onClick={() => submitCode(code)}
              className={primaryBtn}
            >
              {verifying ? 'Verifying…' : 'Verify & enable'}
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => requestOtp(pendingEmail)}
              className={btn}
            >
              Resend
            </button>
          </div>
        </>
      )}
      {error && (
        <span className="text-[12px] text-[var(--danger)]">{error}</span>
      )}
      <span className="text-[11px] leading-relaxed text-[var(--text-tertiary)]">
        We email you a one-time code — no password. Your layouts sync under this
        address; the latest change wins across devices.
      </span>
    </div>
  )
}

function SignedIn() {
  const { email, status, lastSyncedAt, syncNow, restoreFromCloud, signOut } =
    useSyncStore()
  const autoSync = useSettingsStore((s) => s.autoSync)
  const setAutoSync = useSettingsStore((s) => s.setAutoSync)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const syncing = status === 'syncing'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: '#2c8a4a' }}
        />
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            {email || 'Signed in'}
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {syncing ? 'Syncing…' : `Last synced ${relativeTime(lastSyncedAt)}`}
          </span>
        </div>
      </div>

      <FieldRow label="Auto-sync in the background">
        <Toggle checked={autoSync} onChange={setAutoSync} />
      </FieldRow>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => syncNow()}
          className={primaryBtn}
        >
          {syncing ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" /> Sync now
            </span>
          ) : (
            'Sync now'
          )}
        </button>
        <button
          type="button"
          disabled={syncing}
          onClick={() => {
            if (confirmRestore) {
              restoreFromCloud()
              setConfirmRestore(false)
            } else {
              setConfirmRestore(true)
            }
          }}
          onMouseLeave={() => setConfirmRestore(false)}
          className={btn}
        >
          {confirmRestore ? 'Click again to overwrite' : 'Restore from cloud'}
        </button>
      </div>

      <button
        type="button"
        onClick={() => signOut()}
        className="self-start text-[13px] font-medium text-[var(--danger)]"
      >
        Sign out
      </button>
    </div>
  )
}

export function SyncTab() {
  const signedIn = useSyncStore((s) => s.signedIn)
  const consented = useSettingsStore((s) => s.cloudSyncConsented)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Cloud size={18} strokeWidth={1.8} className="text-[var(--text-primary)]" />
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-[var(--text-primary)]">
            Cloud Sync
          </span>
          <span className="text-[12px] text-[var(--text-secondary)]">
            Optional — keep your layouts across devices.
          </span>
        </div>
      </div>

      {signedIn ? (
        <SignedIn />
      ) : (
        <>
          <ConsentPanel />
          {consented && <SignIn />}
        </>
      )}
    </div>
  )
}
