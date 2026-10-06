import { useEffect, useRef } from 'react'
import { daysBetween, parseISODate } from '@shared/dates'
import { formatDistanceWithUnit, formatDuration, formatPace, weekdayShort } from '@shared/format'
import { aboutDuration, clockTime, isKey, sessionSeconds, sessionShort, sessionTitle, unloggedSessions, upcoming, weekIndexFor } from '@shared/plan-view'
import { bestWindow, forecastFor, summarizeDay } from '@shared/weather'
import type { AppState } from '@shared/types'
import { Spinner } from '../components/ui'
import { useAppState } from '../useAppState'
import { useToday } from '../useToday'

/** The menu bar panel (1e in round-2 style): today at a glance. */
export function TrayPanel(): React.JSX.Element {
  const state = useAppState()
  const today = useToday()
  const box = useRef<HTMLDivElement>(null)

  // Keep the window exactly as tall as the content.
  useEffect(() => {
    if (!box.current) return
    const el = box.current
    // Padding and the 1px margin count too, or the bottom gets clipped.
    const ro = new ResizeObserver(() => void window.stride.trayResize(el.getBoundingClientRect().height + 2))
    ro.observe(el)
    return () => ro.disconnect()
  }, [state === null])

  return (
    <div ref={box} className="tray-panel">
      {state ? <Body state={state} today={today} /> : <div style={{ height: 160 }} />}
    </div>
  )
}

function Body({ state, today }: { state: AppState; today: string }): React.JSX.Element {
  const { units } = state.settings
  const race = state.race
  if (!race || state.weeks.length === 0) {
    return (
      <>
        <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>
          {race ? 'Building your plan…' : 'No plan yet'}
        </span>
        <span className="hint">{race ? 'It’ll show here when it’s ready.' : 'Set up a race to get a plan.'}</span>
        <button className="btn-dark" onClick={() => window.stride.openMain(null)}>
          Open Stride
        </button>
      </>
    )
  }

  const session = state.sessions.find((s) => s.date === today && s.type !== 'rest') ?? null
  const run = state.runs.find((r) => r.date === today) ?? null
  const f = forecastFor(state.forecast, today)
  const wx = summarizeDay(f, units)
  const best = f ? bestWindow(f) : null
  const week = weekIndexFor(state.weeks, today) + 1
  const days = daysBetween(today, race.date)
  const toLog = unloggedSessions(state.sessions, state.runs, today).reverse()
  const next = upcoming(state.sessions, today, 3)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Today</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Week {week} · {days > 0 ? `${days} days to race` : days === 0 ? 'Race day' : 'Race done'}
        </span>
      </div>

      <div style={{ background: run || session ? 'var(--hero)' : 'var(--muted-fill)', borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="display" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {run ? `Done · ${formatDistanceWithUnit(run.distanceKm, units)}` : session ? `${sessionShort(session.type)} · ${formatDistanceWithUnit(session.distanceKm, units)}` : 'Rest day'}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--body-2)' }}>
          {run
            ? `${formatDuration(run.durationSec)} · ${formatPace(run.durationSec / run.distanceKm, units)}`
            : session
              ? [session.targetPaceSecPerKm ? formatPace(session.targetPaceSecPerKm, units) : null, aboutDuration(sessionSeconds(session))].filter(Boolean).join(' · ')
              : 'Recovery is when the training sinks in.'}
        </span>
      </div>

      {wx && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 2px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: wx.adverse ? 'var(--sky-text)' : undefined }}>{wx.long}</span>
          {best && session && !run && <span style={{ fontSize: 12, color: 'var(--sky-text)' }}>{best.label}</span>}
        </div>
      )}

      {toLog.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {toLog.slice(0, 3).map((s) => (
            <button key={s.id} className="tray-log" onClick={() => window.stride.openMain({ screen: 'history', logSession: s })}>
              <span style={{ flex: 1 }}>
                Log {weekdayShort(parseISODate(s.date).getDay())}’s {sessionTitle(s.type).toLowerCase()}
              </span>
              <span style={{ color: 'var(--accent-text)', fontWeight: 700 }}>Log</span>
            </button>
          ))}
        </div>
      )}

      {next.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {next.map((s) => {
            // Bad weather ahead gets a short sky note: "· hot, go before 7 am".
            const w = summarizeDay(forecastFor(state.forecast, s.date), units)
            const note = w?.adverse ? w.short.replace(/^\S+\s/, '').toLowerCase() : null
            return (
              <div key={s.id} style={{ display: 'flex', gap: 10, padding: '7px 2px', borderTop: '1px solid var(--divider)', fontSize: 13 }}>
                <span style={{ width: 34, color: 'var(--muted)' }}>{weekdayShort(parseISODate(s.date).getDay())}</span>
                <span style={{ flex: 1, fontWeight: isKey(s.type) ? 600 : undefined, color: isKey(s.type) ? 'var(--accent-text)' : undefined }}>
                  {sessionTitle(s.type)}
                  {note && <span style={{ color: 'var(--sky-text)', fontWeight: 500 }}> · {note}</span>}
                </span>
                <span>{formatDistanceWithUnit(s.distanceKm, units)}</span>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button className="btn-soft" style={{ padding: '10px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }} disabled={state.refresh.running} onClick={() => window.stride.refresh()}>
          {state.refresh.running && <Spinner />}
          {state.refresh.running ? 'Refreshing…' : 'Refresh now'}
        </button>
        <button className="btn-dark" style={{ padding: '10px 0' }} onClick={() => window.stride.openMain(null)}>
          Open Stride
        </button>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--faint)', textAlign: 'center' }}>
        {state.refresh.error ? 'The last refresh didn’t finish.' : state.refresh.lastRunAt ? `Plan refreshed ${clockTime(state.refresh.lastRunAt)}` : `Plan for ${race.name}`}
      </span>
    </>
  )
}
