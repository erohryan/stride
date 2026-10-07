import { addDays, parseISODate } from '@shared/dates'
import { formatDayDate, formatDistanceWithUnit, formatDuration, formatPace, raceDistanceName, weekdayShort } from '@shared/format'
import {
  aboutDuration,
  activeWeatherChange,
  clockTime,
  countdown,
  isKey,
  PHASE_CAPTION,
  PHASE_LABEL,
  predictionStatus,
  sessionSeconds,
  sessionTitle,
  upcoming,
  weatherNoteTitle,
  weekIndexFor
} from '@shared/plan-view'
import { forecastFor, summarizeDay } from '@shared/weather'
import { loadDelta, scoreRun } from '@shared/score'
import type { AppState, ISODate, Phase, Session } from '@shared/types'

interface Props {
  state: AppState
  today: ISODate
  onLogRun: (s: Session | null) => void
}

export function Home({ state, today, onLogRun }: Props): React.JSX.Element {
  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
        <Countdown state={state} today={today} />
        <WeeklyDistance state={state} today={today} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
        <Today state={state} today={today} onLogRun={onLogRun} />
        <WeatherNote state={state} today={today} />
        <ComingUp state={state} today={today} />
      </div>
    </div>
  )
}

// ── Countdown hero ─────────────────────────────────────

function Countdown({ state, today }: { state: AppState; today: ISODate }): React.JSX.Element {
  const race = state.race!
  const { units } = state.settings
  const weeks = state.weeks
  const current = weekIndexFor(weeks, today)
  const phase = weeks[current]?.phase ?? 'base'
  const predicted = state.prediction?.raceDistanceSeconds ?? null
  const finished = today > race.date

  return (
    <section style={{ background: 'var(--hero)', borderRadius: 26, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 20, flex: 'none' }}>
      <span style={{ alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 999, background: 'rgba(255,253,249,.75)', fontSize: 12, fontWeight: 600 }}>
        {raceDistanceName(race.distanceKm, units)} · {formatDayDate(race.date)}
      </span>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
          <span className="display" style={{ fontSize: 68, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 0.95 }}>
            {finished ? 'Race run' : countdown(today, race)}
          </span>
          <span style={{ fontSize: 15, color: 'var(--body-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {finished ? `${race.name} is behind you. Nice work.` : today === race.date ? `${race.name} is today` : `until ${race.name}`}
          </span>
        </div>
        <Stat label="Goal" value={formatDuration(race.goalSeconds)} sub={formatPace(race.goalSeconds / race.distanceKm, units)} />
        <Stat
          label="Predicted"
          value={predicted ? formatDuration(predicted) : '—'}
          sub={predictionStatus(state.prediction, race.goalSeconds)}
          accent
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, 1fr)`, gap: 4 }}>
          {weeks.map((w, i) => (
            <div key={w.index} style={{ height: 8, borderRadius: 99, background: i <= current ? 'var(--apricot)' : 'rgba(255,255,255,.65)', transition: 'background-color .2s var(--ease)' }} />
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--body-2)' }}>
          Week {current + 1} of {weeks.length} · {PHASE_CAPTION[phase]}
        </span>
      </div>
    </section>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      <span className="display" style={{ fontSize: 26, fontWeight: 600, color: accent ? 'var(--accent-text)' : undefined }}>
        {value}
      </span>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</span>
    </div>
  )
}

// ── Weekly distance chart ──────────────────────────────

function WeeklyDistance({ state, today }: { state: AppState; today: ISODate }): React.JSX.Element {
  const { weeks } = state
  const { units } = state.settings
  const current = weekIndexFor(weeks, today)
  const peak = weeks.reduce((a, w) => (w.plannedKm > a.plannedKm ? w : a), weeks[0])
  const cols = `repeat(${weeks.length}, minmax(0, 1fr))`

  // Consecutive weeks of the same phase become one pill on the shared grid (1-based, inclusive).
  const phases: { phase: Phase; from: number; to: number }[] = []
  weeks.forEach((w, i) => {
    const last = phases.at(-1)
    if (last && last.phase === w.phase) last.to = i + 1
    else phases.push({ phase: w.phase, from: i + 1, to: i + 1 })
  })

  return (
    <section className="card" style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="display" style={{ fontSize: 17, fontWeight: 600 }}>
          Weekly distance
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Peak {formatDistanceWithUnit(peak.plannedKm, units)} in week {peak.index}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'end' }}>
        {weeks.map((w, i) => {
          const color = i === current ? 'var(--accent-text)' : 'var(--faint)'
          const bg = i === current ? 'var(--apricot)' : i < current ? 'var(--past-bar)' : '#efe6da'
          return (
            <div key={w.index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, justifyContent: 'flex-end', height: '100%', minHeight: 0 }}>
              {/* Bars share the column's free height (up to 180pt); the peak week fills it. The km label rides on top. */}
              <div style={{ width: '100%', flex: 1, minHeight: 0, maxHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color }}>{Math.round(units === 'metric' ? w.plannedKm : w.plannedKm / 1.609344)}</span>
                <div style={{ width: '100%', height: `calc(${Math.max(4, (w.plannedKm / peak.plannedKm) * 100)}% - 18px)`, background: bg, borderRadius: 10, transition: 'height .3s var(--ease), background-color .2s var(--ease)' }} />
              </div>
              <span style={{ fontSize: 11, color }}>W{w.index}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>
        {phases.map((p) => {
          const on = current + 1 >= p.from && current + 1 <= p.to
          return (
            <div
              key={p.from}
              style={{
                gridColumn: `${p.from} / ${p.to + 1}`,
                background: on ? 'var(--hero)' : 'var(--muted-fill)',
                color: on ? 'var(--ink)' : undefined,
                borderRadius: 99,
                padding: '4px 10px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {PHASE_LABEL[p.phase]}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Right column ───────────────────────────────────────

function Today({ state, today, onLogRun }: Props): React.JSX.Element {
  const { units } = state.settings
  const session = state.sessions.find((s) => s.date === today && s.type !== 'rest') ?? null
  const run = state.runs.find((r) => r.date === today) ?? null
  const wx = summarizeDay(forecastFor(state.forecast, today), units)
  const next = upcoming(state.sessions, today, 1)[0]
  const label = `Today · ${formatDayDate(today)}`

  let title: string
  let big: string
  let sub: string
  if (run) {
    const score = scoreRun(run, session)
    title = score.total !== null ? `Logged · ${score.total} · ${score.label}` : 'Logged today'
    big = formatDistanceWithUnit(run.distanceKm, units)
    sub = `${formatDuration(run.durationSec)} · ${formatPace(run.durationSec / run.distanceKm, units)} · load ${score.load.actual}${score.load.planned ? ` (${loadDelta(score.load.ratio)})` : ''}`
  } else if (session) {
    title = sessionTitle(session.type)
    big = formatDistanceWithUnit(session.distanceKm, units)
    const about = aboutDuration(sessionSeconds(session))
    sub = [session.targetPaceSecPerKm ? formatPace(session.targetPaceSecPerKm, units) : null, about].filter(Boolean).join(' · ')
  } else {
    title = 'Rest day'
    big = 'Rest'
    sub = next ? `Next: ${sessionTitle(next.type).toLowerCase()} on ${weekdayShort(parseISODate(next.date).getDay())}` : 'Nothing else planned'
  }

  return (
    <section className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: session || run ? 'var(--accent-text)' : 'var(--muted)', marginTop: 6 }}>
        {title}
      </span>
      <span className="display" style={{ fontSize: 54, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {big}
      </span>
      <span style={{ fontSize: 13, color: 'var(--body-2)' }}>{sub}</span>
      {wx && (
        <span style={{ alignSelf: 'flex-start', marginTop: 10, padding: '6px 12px', borderRadius: 999, background: 'var(--bg)', fontSize: 12.5, fontWeight: 500, color: wx.adverse ? 'var(--sky-text)' : undefined }}>
          {wx.long}
        </span>
      )}
      {session && !run && (
        <button className="btn-dark" style={{ marginTop: 14 }} onClick={() => onLogRun(session)}>
          Log this run
        </button>
      )}
      {!session && !run && (
        <button className="btn-float" style={{ marginTop: 14, justifyContent: 'center', boxShadow: 'none', background: 'var(--bg)' }} onClick={() => onLogRun(null)}>
          Log a run anyway
        </button>
      )}
    </section>
  )
}

function WeatherNote({ state, today }: { state: AppState; today: ISODate }): React.JSX.Element | null {
  const cs = activeWeatherChange(state.changeSets, today)
  if (!cs) return null
  return (
    <section className="fade-in" style={{ background: 'var(--sky-tint)', borderRadius: 22, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--sky-text)' }}>{weatherNoteTitle(cs.reason)}</span>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--body-on-tint)', textWrap: 'pretty' }}>{cs.reason}</span>
      <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
        Updated {clockTime(cs.createdAt)} ·{' '}
        <button style={{ color: 'var(--sky-text)', fontWeight: 600 }} onClick={() => window.stride.undo(cs.id)}>
          Undo
        </button>
      </span>
    </section>
  )
}

function ComingUp({ state, today }: { state: AppState; today: ISODate }): React.JSX.Element {
  const { units } = state.settings
  const next = upcoming(state.sessions, today, 4)
  const horizon = addDays(today, 7)
  return (
    <section className="card" style={{ borderRadius: 22, padding: '16px 20px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <span className="display" style={{ fontSize: 15, fontWeight: 600, paddingBottom: 6 }}>
        Coming up
      </span>
      {next.length === 0 && <span className="hint">Nothing else planned before race day.</span>}
      {next.map((s) => {
        const key = isKey(s.type)
        return (
          <div key={s.id} className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--divider)', fontSize: 13 }}>
            <span style={{ minWidth: 34, color: 'var(--muted)', flex: 'none' }}>
              {s.date < horizon ? weekdayShort(parseISODate(s.date).getDay()) : formatDayDate(s.date).slice(4)}
            </span>
            <span style={{ flex: 1, fontWeight: key ? 600 : undefined, color: key ? 'var(--accent-text)' : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {sessionTitle(s.type)}
              {s.movedFrom && <span style={{ color: 'var(--sky-text)', fontWeight: 500 }}> · moved</span>}
            </span>
            <span>{formatDistanceWithUnit(s.distanceKm, units)}</span>
          </div>
        )
      })}
    </section>
  )
}
