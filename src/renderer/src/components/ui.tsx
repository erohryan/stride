import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Location, Weekday } from '@shared/types'
import { weekdayLong } from '@shared/format'

export function Field({ label, optional, children, error }: { label: string; optional?: boolean; children: ReactNode; error?: string | null }): React.JSX.Element {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {optional && <span className="opt"> · optional</span>}
      </span>
      {children}
      {error && <span className="error-text">{error}</span>}
    </label>
  )
}

interface TextInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  suffix?: string
  type?: 'text' | 'number' | 'date'
  invalid?: boolean
  autoFocus?: boolean
  width?: number
  inputMode?: 'decimal' | 'numeric' | 'text'
}

export function TextInput({ value, onChange, placeholder, suffix, type = 'text', invalid, autoFocus, width, inputMode }: TextInputProps): React.JSX.Element {
  return (
    <div className={`input${invalid ? ' invalid' : ''}`} style={width ? { width } : undefined}>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }): React.JSX.Element {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Monday-first, as runners think about their week.
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0]
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function RunDays({ value, onChange }: { value: Weekday[]; onChange: (v: Weekday[]) => void }): React.JSX.Element {
  const toggle = (d: Weekday): void => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())
  return (
    <div className="day-toggles">
      {WEEK.map((d) => (
        <button key={d} type="button" aria-pressed={value.includes(d)} aria-label={weekdayLong(d)} onClick={() => toggle(d)}>
          {LETTERS[d]}
        </button>
      ))}
    </div>
  )
}

export function runDaysHint(days: Weekday[]): string {
  if (days.length === 0) return 'Pick the days you can run.'
  if (days.length === 7) return 'Every day. Easy days do the recovering.'
  return `${days.length} day${days.length === 1 ? '' : 's'} a week. Rest falls on the others.`
}

export function WeekdaySelect({ value, onChange }: { value: Weekday; onChange: (d: Weekday) => void }): React.JSX.Element {
  return (
    <div className="input" style={{ width: 160 }}>
      <select value={value} onChange={(e) => onChange(Number(e.target.value) as Weekday)}>
        {WEEK.map((d) => (
          <option key={d} value={d}>
            {weekdayLong(d)}
          </option>
        ))}
      </select>
      <span className="suffix">⌄</span>
    </div>
  )
}

/** Type-ahead place search backed by Open-Meteo geocoding. */
export function PlaceSearch({ value, onChange, placeholder }: { value: Location | null; onChange: (l: Location | null) => void; placeholder?: string }): React.JSX.Element {
  const [text, setText] = useState(value?.name ?? '')
  const [results, setResults] = useState<Location[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [failed, setFailed] = useState(false)
  const seq = useRef(0)

  useEffect(() => setText(value?.name ?? ''), [value])

  useEffect(() => {
    if (!open || text === value?.name) return
    const n = ++seq.current
    const t = setTimeout(() => {
      window.stride
        .searchPlaces(text)
        .then((r) => {
          if (n !== seq.current) return
          setResults(r)
          setActive(0)
          setFailed(false)
        })
        .catch(() => n === seq.current && setFailed(true))
    }, 250)
    return () => clearTimeout(t)
  }, [text, open, value])

  const pick = (l: Location): void => {
    onChange(l)
    setText(l.name)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="input">
        <input
          value={text}
          placeholder={placeholder ?? 'Search for a town or suburb'}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            if (value) onChange(null)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            else if (e.key === 'Enter' && results[active]) {
              e.preventDefault()
              pick(results[active])
            }
          }}
        />
      </div>
      {open && text.length >= 2 && !value && (results.length > 0 || failed) && (
        <div className="popover fade-in">
          {failed ? (
            <span className="hint" style={{ display: 'block', padding: '8px 12px' }}>
              Couldn't search right now. Check your connection.
            </span>
          ) : (
            results.map((r, i) => (
              <button key={`${r.lat},${r.lon}`} type="button" data-active={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)}>
                {r.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function Spinner({ size = 12 }: { size?: number }): React.JSX.Element {
  return <span className="spinner" style={{ width: size, height: size }} />
}

/** Seconds since `since`, ticking once a second. */
export function useElapsed(since: number | null): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (since === null) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [since])
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000))
}
