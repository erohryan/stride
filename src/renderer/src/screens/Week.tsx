import { useEffect, useState } from 'react'
import { addDays, parseISODate } from '@shared/dates'
import { formatDayDate, formatDistanceWithUnit, formatPace, weekdayShort } from '@shared/format'
import {
  aboutDuration,
  changeHeadline,
  clockTime,
  isDone,
  isKey,
  sessionSeconds,
  sessionShort,
  sessionSummary,
  structureRows,
  weekDays,
  weekIndexFor,
  weekRange,
  type Day
} from '@shared/plan-view'
import { bestWindow, forecastFor, morningCells, summarizeDay } from '@shared/weather'
import type { AppState, ChangeSet, ISODate, Session } from '@shared/types'
import { scoreRun, weekLoad } from '@shared/score'
import { RunScoreCard, ScorePill, scoreTone } from '../components/RunScore'

interface Props {
  state: AppState
  today: ISODate
  onLogRun: (s: Session) => void
}

export function Week({ state, today, onLogRun }: Props): React.JSX.Element {
  const { weeks } = state
  const { units } = state.settings
  const [index, setIndex] = useState(() => weekIndexFor(weeks, today))
  const week = weeks[Math.min(index, weeks.length - 1)]
  const days = weekDays(week.startDate, state.sessions, state.runs, today)
  const [selected, setSelected] = useState<ISODate>(() => defaultSelection(days))

  // Moving between weeks picks a sensible day in the new one.
  useEffect(() => setSelected(defaultSelection(days)), [week.startDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const change = weatherChangeFor(state.changeSets, week.startDate)
  const load = weekLoad(week.startDate, state.sessions, state.runs)
  const day = days.find((d) => d.date === selected) ?? days[0]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 14, padding: '0 6px' }}>
        <span className="display" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {weekRange(week.startDate)}
        </span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          Week {week.index} of {weeks.length} · {formatDistanceWithUnit(week.plannedKm, units)}
          {load.actual > 0 && ` · Load ${load.actual} of ${load.planned} planned`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignSelf: 'center' }}>
          <RoundButton label="Previous week" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            ‹
          </RoundButton>
          <RoundButton label="Next week" disabled={index >= weeks.length - 1} onClick={() => setIndex(index + 1)}>
            ›
          </RoundButton>
        </div>
      </div>

      {change && <ChangeBanner change={change} />}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10, minHeight: 0 }}>
          {days.map((d) => (
            <DayTile key={d.date} day={d} state={state} selected={d.date === selected} onSelect={() => setSelected(d.date)} />
          ))}
        </div>
        <DetailPanel day={day} state={state} today={today} onLogRun={onLogRun} />
      </div>
    </div>
  )
}

function defaultSelection(days: Day[]): ISODate {
  return (days.find((d) => d.isToday) ?? days.find((d) => !d.isPast && d.session) ?? days.find((d) => d.session) ?? days[0]).date
}

/** The newest weather change still in force that touches this week. */
function weatherChangeFor(changeSets: ChangeSet[], start: ISODate): ChangeSet | null {
  const end = addDays(start, 6)
  return changeSets.find((c) => c.kind === 'weather' && !c.reverted && !c.superseded && [...c.after, ...c.before].some((s) => s.date >= start && s.date <= end)) ?? null
}

function RoundButton({ children, label, disabled, onClick }: { children: string; label: string; disabled?: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="round-btn"
      style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontSize: 14, opacity: disabled ? 0.4 : 1 }}
    >
      {children}
    </button>
  )
}

function ChangeBanner({ change }: { change: ChangeSet }): React.JSX.Element {
  return (
    <div className="fade-in" style={{ flex: 'none', background: 'var(--sky-tint)', borderRadius: 22, padding: '16px 20px', display: 'flex', gap: 18, alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--sky-text)' }}>{changeHeadline(change)}</span>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--body-on-tint)', textWrap: 'pretty' }}>{change.reason}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: 'none' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Applied {clockTime(change.createdAt)}</span>
        <button className="pill-btn" style={{ color: 'var(--sky-text)' }} onClick={() => window.stride.undo(change.id)}>
          Undo
        </button>
      </div>
    </div>
  )
}

function DayTile({ day, state, selected, onSelect }: { day: Day; state: AppState; selected: boolean; onSelect: () => void }): React.JSX.Element {
  const { units } = state.settings
  const s = day.session && day.session.type !== 'rest' ? day.session : null
  const done = isDone(day)
  const moved = !!s?.movedFrom
  const missed = day.isPast && s && !done
  const wx = day.isPast ? null : summarizeDay(forecastFor(state.forecast, day.date), units)
  const score = day.run ? scoreRun(day.run, s) : null

  const bg = day.isToday ? 'var(--hero)' : moved ? 'var(--sky-tint)' : !s && !day.run ? 'var(--muted-fill)' : 'var(--card)'
  const border = day.isToday ? 'var(--apricot)' : selected ? 'rgba(45,38,33,.22)' : 'transparent'
  const tag = day.run ? (score?.label ? `Logged · ${score.label}` : 'Logged · extra') : moved && !day.isPast ? 'Moved for weather' : day.isToday ? 'Today' : done ? 'Done' : missed ? 'Missed' : ''
  const tagColor = day.run ? scoreTone(score?.total ?? null).color : moved && !day.isPast ? 'var(--sky-text)' : missed ? 'var(--faint)' : 'var(--accent-text)'
  const date = parseISODate(day.date)

  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className="day-tile"
      style={{
        borderRadius: 22,
        background: bg,
        border: `2px solid ${border}`,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        textAlign: 'left',
        minWidth: 0,
        // Past days fade, except ones with a logged run: those are the record.
        opacity: day.isPast && !day.isToday && !day.run ? 0.5 : 1
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
        <span>
          {weekdayShort(date.getDay())} {date.getDate()}
        </span>
        {score && <ScorePill score={score} />}
      </span>
      {/* Keyed on content so a session the plan changed fades in fresh. */}
      <div key={s ? `${s.id}:${s.type}:${s.distanceKm}` : 'rest'} className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
        {s && day.run ? (
          // Logged against a plan: what was run, and what was planned.
          <>
            <span style={{ fontSize: 13, fontWeight: 700, color: isKey(s.type) ? 'var(--accent-text)' : 'var(--ink)' }}>{sessionShort(s.type)}</span>
            <span className="display" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              {formatDistanceWithUnit(day.run.distanceKm, units)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {formatPace(day.run.durationSec / day.run.distanceKm, units)} · of {formatDistanceWithUnit(s.distanceKm, units)}
            </span>
          </>
        ) : s || !day.run ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 700, color: !s ? 'var(--faint)' : isKey(s.type) ? 'var(--accent-text)' : 'var(--ink)' }}>{s ? sessionShort(s.type) : 'Rest'}</span>
            <span className="display" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              {s ? formatDistanceWithUnit(s.distanceKm, units) : '—'}
            </span>
            {s && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sessionSummary(s, units)}</span>}
          </>
        ) : (
          // An unplanned run on a rest day still counts.
          <>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{sessionShort(day.run.type)}</span>
            <span className="display" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              {formatDistanceWithUnit(day.run.distanceKm, units)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{formatPace(day.run.durationSec / day.run.distanceKm, units)}</span>
          </>
        )}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {wx && <span style={{ fontSize: 11.5, lineHeight: 1.35, color: wx.adverse ? 'var(--sky-text)' : 'var(--muted)' }}>{wx.short}</span>}
        {tag && <span style={{ fontSize: 11, fontWeight: 700, color: tagColor }}>{tag}</span>}
      </div>
    </button>
  )
}

function DetailPanel({ day, state, today, onLogRun }: { day: Day; state: AppState; today: ISODate; onLogRun: (s: Session) => void }): React.JSX.Element {
  const { units } = state.settings
  const s = day.session && day.session.type !== 'rest' ? day.session : null
  const f = forecastFor(state.forecast, day.date)
  const best = f ? bestWindow(f) : null
  const cells = f ? morningCells(f, units) : []
  const place = state.profile?.location?.name
  const run = day.run
  const about = s ? aboutDuration(sessionSeconds(s)) : null

  return (
    <div className="card" style={{ borderRadius: 24, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflowY: 'auto' }}>
      <div key={day.date} className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDayDate(day.date)}</span>
        <span className="display" style={{ fontSize: 22, fontWeight: 700 }}>
          {s ? `${sessionShort(s.type)} · ${formatDistanceWithUnit(s.distanceKm, units)}` : 'Rest day'}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {s ? (about ? about[0].toUpperCase() + about.slice(1) : '') : 'Recovery is when the training sinks in.'}
        </span>
      </div>

      {run && <RunScoreCard run={run} score={scoreRun(run, s)} units={units} />}

      {s && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {run && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Planned</span>}
          {structureRows(s, units).map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                background: r.main ? 'var(--hero)' : 'var(--inset)',
                fontSize: 13,
                fontWeight: r.main ? 700 : undefined
              }}
            >
              <span>{r.label}</span>
              <span style={{ color: r.main ? undefined : 'var(--muted)', textAlign: 'right' }}>{r.detail}</span>
            </div>
          ))}
        </div>
      )}

      {s?.notes && <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--body-2)' }}>{s.notes}</span>}

      {cells.length > 0 && !day.isPast && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Forecast{place ? ` · ${place.split(',')[0]}` : ''}</span>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: 5, textAlign: 'center' }}>
            {cells.map((c) => (
              <div key={c.label} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 0', borderRadius: 12, background: c.inWindow ? 'var(--sky-tint)' : 'var(--inset)' }}>
                <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{c.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{c.temp}</span>
              </div>
            ))}
          </div>
          {best && !/best window/i.test(s?.notes ?? '') && <span style={{ fontSize: 12.5, color: 'var(--sky-text)', fontWeight: 600 }}>{best.label}</span>}
        </div>
      )}

      <div style={{ marginTop: 'auto' }}>
        {!run && (
          s &&
          day.date <= today && (
            <button className="btn-dark" style={{ width: '100%' }} onClick={() => onLogRun(s)}>
              Log this run
            </button>
          )
        )}
      </div>
    </div>
  )
}
