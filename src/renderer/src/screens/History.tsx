import { useEffect, useState } from 'react'
import { formatDayDate, formatDistanceWithUnit, formatDuration, formatPace, MONTHS_LONG, weekdayShort } from '@shared/format'
import { sessionShort, sessionTitle, unloggedSessions } from '@shared/plan-view'
import { parseISODate } from '@shared/dates'
import type { AppState, ISODate, Run, Session } from '@shared/types'
import { LogRun } from './LogRun'

/** What the right-hand card is doing. */
export type LogTarget =
  | { kind: 'new'; session: Session | null; nonce: number; files?: File[]; benchmark?: boolean }
  | { kind: 'edit'; run: Run }

interface Props {
  state: AppState
  today: ISODate
  target: LogTarget
  onTarget: (t: LogTarget) => void
}

export function History({ state, today, target, onTarget }: Props): React.JSX.Element {
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const close = (message?: string): void => {
    if (message) setToast(message)
    onTarget({ kind: 'new', session: null, nonce: Date.now() })
  }

  // Remount the card whenever its subject changes, so it starts clean.
  const cardKey = target.kind === 'edit' ? `edit:${target.run.id}` : `new:${target.session?.id ?? ''}:${target.nonce}`

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '400px minmax(0, 1fr)', gap: 18 }}>
      <RunList state={state} today={today} target={target} onTarget={onTarget} />
      <LogRun
        key={cardKey}
        state={state}
        prefill={target.kind === 'new' ? target.session : null}
        editing={target.kind === 'edit' ? target.run : null}
        initialFiles={target.kind === 'new' ? target.files : undefined}
        asBenchmark={target.kind === 'new' && !!target.benchmark}
        onClose={close}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function RunList({ state, today, target, onTarget }: Props): React.JSX.Element {
  const { units } = state.settings
  const runs = state.runs
  const toLog = unloggedSessions(state.sessions, state.runs, today).reverse()
  const months = [...new Set(runs.map((r) => MONTHS_LONG[parseISODate(r.date).getMonth()]))]
  const range = months.length > 1 ? `${months.at(-1)} – ${months[0]}` : (months[0] ?? '')

  return (
    <section className="card" style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, overflowY: 'auto' }}>
      {toLog.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 0 14px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', padding: '0 6px' }}>To log</span>
          {toLog.map((s) => (
            <ToLogRow key={s.id} session={s} units={units} onLog={() => onTarget({ kind: 'new', session: s, nonce: Date.now() })} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 6px 10px' }}>
        <span className="display" style={{ fontSize: 18, fontWeight: 600 }}>
          Your runs
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{range}</span>
      </div>
      {runs.length === 0 && <span className="hint" style={{ padding: '4px 6px' }}>Nothing logged yet. Your runs land here once you add them.</span>}
      {runs.map((r) => (
        <button key={r.id} className="run-row" aria-current={target.kind === 'edit' && target.run.id === r.id} onClick={() => onTarget({ kind: 'edit', run: r })}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{runTitle(r)}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {formatDayDate(r.date)} · {formatDuration(r.durationSec)} · {formatPace(r.durationSec / r.distanceKm, units)}
            </span>
          </span>
          {r.isBenchmark && <Badge bg="var(--hero)" color="var(--accent-text)">Benchmark</Badge>}
          <Badge bg={r.source === 'screenshot' ? 'var(--sky-tint)' : 'var(--muted-fill)'} color={r.source === 'screenshot' ? 'var(--sky-text)' : 'var(--muted)'}>
            {r.source === 'screenshot' ? 'Screenshot' : 'Manual'}
          </Badge>
          <span className="display" style={{ fontSize: 16, fontWeight: 700, width: 62, textAlign: 'right' }}>
            {formatDistanceWithUnit(r.distanceKm, units).replace(/^(\d+) /, '$1.0 ')}
          </span>
        </button>
      ))}
    </section>
  )
}

function runTitle(r: Run): string {
  if (r.type === 'race') return 'Race'
  return r.type === 'long' ? 'Long run' : sessionShort(r.type)
}

function ToLogRow({ session, units, onLog }: { session: Session; units: AppState['settings']['units']; onLog: () => void }): React.JSX.Element {
  const date = parseISODate(session.date)
  return (
    <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 16, background: 'var(--hero)' }}>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          {weekdayShort(date.getDay())} {date.getDate()} · {sessionTitle(session.type)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--body-2)' }}>{formatDistanceWithUnit(session.distanceKm, units)} planned</span>
      </span>
      <button className="pill-btn" style={{ background: 'transparent', color: 'var(--muted)' }} onClick={() => window.stride.skipSession(session.id)}>
        Didn’t run
      </button>
      <button className="pill-btn" onClick={onLog}>
        Log it
      </button>
    </div>
  )
}

function Badge({ bg, color, children }: { bg: string; color: string; children: string }): React.JSX.Element {
  return <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: bg, color, flex: 'none' }}>{children}</span>
}
