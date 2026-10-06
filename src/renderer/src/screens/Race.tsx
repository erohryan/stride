import { useRef, useState } from 'react'
import { addDays, daysBetween, parseISODate } from '@shared/dates'
import { formatDayDate, formatDistanceWithUnit, formatDuration, formatPace, MONTHS } from '@shared/format'
import { sessionShort } from '@shared/plan-view'
import type { AppState, GoalOptions, ISODate, Prediction, Run } from '@shared/types'
import { GoalPicker, goalSeconds, type GoalChoice } from '../components/GoalPicker'
import { RaceSetup } from './Onboarding'

interface Props {
  state: AppState
  today: ISODate
  /** Screenshots dropped on "Improve the prediction" go to the log for review. */
  onBenchmarkFiles: (files: File[]) => void
}

export function Race({ state, today, onBenchmarkFiles }: Props): React.JSX.Element {
  const [newRace, setNewRace] = useState(false)
  if (newRace) return <RaceSetup state={state} onCancel={() => setNewRace(false)} />

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
        <Predictions state={state} today={today} />
        <Improve state={state} onFiles={onBenchmarkFiles} />
      </div>
      <Goal state={state} today={today} onNewRace={() => setNewRace(true)} />
    </div>
  )
}

// ── Predicted race times ───────────────────────────────

const DISTANCES: { key: keyof Prediction['times']; label: string; km: number }[] = [
  { key: '5k', label: '5 km', km: 5 },
  { key: '10k', label: '10 km', km: 10 },
  { key: 'half', label: 'Half marathon', km: 21.0975 },
  { key: 'marathon', label: 'Marathon', km: 42.195 }
]

function Predictions({ state, today }: { state: AppState; today: ISODate }): React.JSX.Element {
  const { units } = state.settings
  const race = state.race!
  const p = state.prediction
  const mine = DISTANCES.find((d) => Math.abs(d.km - race.distanceKm) < 0.05)

  return (
    <section className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 16, flex: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="card-title">Predicted race times</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>From your last 6 weeks</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        {DISTANCES.map((d) => {
          const on = d === mine
          const t = p?.times[d.key]
          return (
            <div key={d.key} style={{ background: on ? 'var(--hero)' : 'var(--inset)', borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, color: on ? 'var(--body-2)' : 'var(--muted)', fontWeight: on ? 600 : undefined }}>{on ? `${d.label} · your race` : d.label}</span>
              <span className="display" style={{ fontSize: 28, fontWeight: 700 }}>
                {t ? formatDuration(t) : '—'}
              </span>
              <span style={{ fontSize: 12, color: on ? 'var(--body-2)' : 'var(--muted)' }}>{t ? formatPace(t / d.km, units) : ''}</span>
            </div>
          )
        })}
      </div>
      <Trend history={state.predictionHistory} today={today} label={mine ? `${mine.label} prediction` : `${formatDistanceWithUnit(race.distanceKm, units)} prediction`} />
    </section>
  )
}

/** One bar per week for the last 6 weeks; faster predictions stand taller. */
function Trend({ history, today, label }: { history: Prediction[]; today: ISODate; label: string }): React.JSX.Element | null {
  const from = addDays(today, -42)
  const recent = history.filter((h) => h.computedAt.slice(0, 10) >= from)
  if (recent.length === 0) return null
  // Latest prediction in each week, oldest first.
  const byWeek = new Map<number, Prediction>()
  for (const h of recent) byWeek.set(Math.floor(daysBetween(from, h.computedAt.slice(0, 10)) / 7), h)
  const points = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([, h]) => h)
  const secs = points.map((x) => x.raceDistanceSeconds)
  const [slow, fast] = [Math.max(...secs), Math.min(...secs)]
  const first = points[0]
  const last = points.at(-1)!
  const gained = first.raceDistanceSeconds - last.raceDistanceSeconds
  const since = (() => {
    const d = parseISODate(first.computedAt.slice(0, 10))
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`
  })()
  const caption =
    points.length < 2 ? `First prediction, ${since}` : Math.abs(gained) < 5 ? `Steady since ${since}` : `${formatDuration(Math.abs(gained))} ${gained > 0 ? 'faster' : 'slower'} since ${since}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{caption}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56 }}>
        {points.map((h, i) => {
          const pct = slow === fast ? 70 : 30 + ((slow - h.raceDistanceSeconds) / (slow - fast)) * 70
          const latest = i === points.length - 1
          const bg = latest ? 'var(--apricot)' : i >= points.length - 3 ? 'var(--past-bar)' : '#efe6da'
          return <div key={h.computedAt} title={formatDuration(h.raceDistanceSeconds)} style={{ flex: 1, height: `${pct}%`, background: bg, borderRadius: 8, transition: 'height .3s var(--ease)' }} />
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--faint)' }}>
        <span>{formatDuration(first.raceDistanceSeconds)}</span>
        <span>{formatDuration(last.raceDistanceSeconds)} now</span>
      </div>
    </div>
  )
}

// ── Improve the prediction ─────────────────────────────

function Improve({ state, onFiles }: { state: AppState; onFiles: (f: File[]) => void }): React.JSX.Element {
  const { units } = state.settings
  const benchmark = state.runs.find((r) => r.isBenchmark) ?? null
  const [picking, setPicking] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // Hard efforts first: they say the most about race fitness.
  const candidates = [...state.runs].sort((a, b) => b.effort - a.effort || b.date.localeCompare(a.date)).slice(0, 8)

  return (
    <section className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="display" style={{ fontSize: 16, fontWeight: 600 }}>
          Improve the prediction
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Add a recent hard effort</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        <button
          className="drop-zone"
          data-over={over}
          style={{ flex: 1, border: '2px dashed var(--dashed)', background: 'repeating-linear-gradient(135deg,#f6efe5 0 8px,#fbf6ef 8px 16px)', padding: 14, minHeight: 110 }}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            onFiles([...e.dataTransfer.files])
          }}
        >
          <span style={{ font: '500 11px ui-monospace, Menlo, monospace', color: 'var(--muted)' }}>drop a screenshot of a good run</span>
          <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>Watch summary, Strava or a race result</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*,.heic"
          multiple
          hidden
          onChange={(e) => {
            onFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center', position: 'relative', minWidth: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Currently using</span>
          {benchmark ? (
            <div style={{ background: 'var(--inset)', borderRadius: 14, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{runLabel(benchmark, units)}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {formatDayDate(benchmark.date)} · {formatDuration(benchmark.durationSec)} · {formatPace(benchmark.durationSec / benchmark.distanceKm, units)}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 12.5, color: 'var(--body-2)', lineHeight: 1.45 }}>Your recent runs{state.profile?.recentRace ? ' and the race you told us about' : ''}.</span>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-text)', alignSelf: 'flex-start' }} disabled={candidates.length === 0} onClick={() => setPicking(!picking)}>
              Choose from history
            </button>
            {benchmark && (
              <button style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }} onClick={() => window.stride.setBenchmark(null)}>
                Clear
              </button>
            )}
          </div>
          {picking && (
            <div className="popover fade-in" style={{ top: 'auto', bottom: 'calc(100% - 20px)' }}>
              {candidates.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setPicking(false)
                    void window.stride.setBenchmark(r.id)
                  }}
                >
                  <b style={{ fontWeight: 700 }}>{runLabel(r, units)}</b>
                  <span style={{ color: 'var(--muted)' }}>
                    {' '}
                    · {formatDayDate(r.date)} · effort {r.effort}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** "10 km time trial", "Long run · 15 km". */
function runLabel(r: Run, units: AppState['settings']['units']): string {
  const dist = formatDistanceWithUnit(r.distanceKm, units)
  if (r.type === 'race') return `${dist} race`
  if (r.effort >= 9) return `${dist} time trial`
  return `${r.type === 'long' ? 'Long run' : sessionShort(r.type)} · ${dist}`
}

// ── Your goal ──────────────────────────────────────────

function initialChoice(options: GoalOptions | null, goal: number): GoalChoice {
  if (!options) return 'own'
  const hit = (['comfortable', 'realistic', 'stretch'] as const).find((k) => Math.abs(options[k] - goal) < 1)
  return hit ?? 'own'
}

function Goal({ state, today, onNewRace }: { state: AppState; today: ISODate; onNewRace: () => void }): React.JSX.Element {
  const race = state.race!
  const { units } = state.settings
  const options = state.goalOptions
  const [choice, setChoice] = useState<GoalChoice>(() => initialChoice(options, race.goalSeconds))
  const [ownTime, setOwnTime] = useState(() => (initialChoice(options, race.goalSeconds) === 'own' ? formatDuration(race.goalSeconds) : ''))
  const [saving, setSaving] = useState(false)
  const chosen = options ? goalSeconds(options, choice, ownTime) : null
  const changed = chosen !== null && Math.abs(chosen - race.goalSeconds) >= 1
  const weeksLeft = Math.max(1, Math.ceil(daysBetween(today, race.date) / 7))
  const busy = saving || state.refresh.running

  const save = async (): Promise<void> => {
    if (chosen === null) return
    setSaving(true)
    try {
      await window.stride.saveGoal(chosen)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <span className="card-title">Your goal</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {race.name} · {formatDayDate(race.date)} · {formatDistanceWithUnit(race.distanceKm, units)}
          </span>
        </div>
        <button className="pill-btn" style={{ background: 'var(--muted-fill)' }} onClick={onNewRace}>
          New race
        </button>
      </div>
      {options ? (
        <GoalPicker options={options} distanceKm={race.distanceKm} units={units} choice={choice} ownTime={ownTime} onChoose={setChoice} onOwnTime={setOwnTime} />
      ) : (
        <span className="hint">Goal suggestions appear after the next plan refresh.</span>
      )}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
          {state.refresh.running ? 'Updating the plan…' : `Changing your goal rebuilds the remaining ${weeksLeft} week${weeksLeft === 1 ? '' : 's'}.`}
        </span>
        <button className="btn-dark" style={{ padding: '11px 22px' }} disabled={!changed || busy} onClick={save}>
          Save goal
        </button>
      </div>
    </section>
  )
}
