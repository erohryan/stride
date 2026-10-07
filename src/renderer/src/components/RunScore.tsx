import { formatDistanceWithUnit, formatDuration, formatPace } from '@shared/format'
import { loadDelta, type RunScore } from '@shared/score'
import type { Run, Units } from '@shared/types'

/** Badge colours by score: apricot for on-plan runs (they're today's good news), neutral otherwise. */
export function scoreTone(total: number | null): { bg: string; color: string } {
  if (total === null) return { bg: 'var(--muted-fill)', color: 'var(--muted)' }
  if (total >= 75) return { bg: 'var(--hero)', color: 'var(--accent-text)' }
  if (total >= 60) return { bg: 'var(--muted-fill)', color: 'var(--ink)' }
  return { bg: 'var(--muted-fill)', color: 'var(--muted)' }
}

export function ScorePill({ score, size = 'sm' }: { score: RunScore; size?: 'sm' | 'md' }): React.JSX.Element {
  const tone = scoreTone(score.total)
  return (
    <span
      title={score.label ?? 'Not planned'}
      style={{
        padding: size === 'sm' ? '2px 8px' : '3px 10px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.color,
        fontSize: size === 'sm' ? 11 : 11.5,
        fontWeight: 700,
        flex: 'none',
        whiteSpace: 'nowrap'
      }}
    >
      {score.total ?? 'Extra'}
    </span>
  )
}

/** The logged run against its session: score, the four parts, and load. */
export function RunScoreCard({ run, score, units }: { run: Run; score: RunScore; units: Units }): React.JSX.Element {
  const tone = scoreTone(score.total)
  const rows: { label: string; actual: string; note: string; good: boolean }[] = []
  if (score.distance) {
    const d = score.distance
    const pct = Math.round((d.actualKm / d.plannedKm - 1) * 100)
    rows.push({
      label: 'Distance',
      actual: formatDistanceWithUnit(d.actualKm, units),
      note: Math.abs(pct) <= 5 ? `planned ${formatDistanceWithUnit(d.plannedKm, units)}` : `${pct > 0 ? '+' : ''}${pct}% of ${formatDistanceWithUnit(d.plannedKm, units)}`,
      good: d.score >= 75
    })
  }
  if (score.pace) {
    const p = score.pace
    const diff = Math.abs(p.diffSec) * (units === 'metric' ? 1 : 1.609344)
    rows.push({
      label: 'Pace',
      actual: formatPace(p.actual, units),
      note: Math.abs(p.diffSec) <= 3 ? 'right on plan' : `${Math.round(diff)} s ${p.diffSec < 0 ? 'faster' : 'slower'} than planned`,
      good: p.score >= 75
    })
  }
  if (score.effort) {
    const e = score.effort
    rows.push({
      label: 'Effort',
      actual: `${e.actual} / 10`,
      note: e.score === 100 ? `as planned (${e.expected[0]}–${e.expected[1]})` : e.actual > e.expected[1] ? `harder than planned (${e.expected[0]}–${e.expected[1]})` : `easier than planned (${e.expected[0]}–${e.expected[1]})`,
      good: e.score >= 75
    })
  }
  if (score.type && !score.type.matches) rows.push({ label: 'Session', actual: run.type, note: 'a different session from the plan', good: false })
  rows.push({
    label: 'Load',
    actual: String(score.load.actual),
    note: score.load.planned ? `${loadDelta(score.load.ratio)} (planned ${score.load.planned})` : 'an extra run, on top of the plan',
    good: score.load.ratio === null || Math.abs(score.load.ratio - 1) <= 0.25
  })

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 16, background: tone.bg }}>
        <span className="display" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', color: tone.color, lineHeight: 1 }}>
          {score.total ?? '—'}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{score.label ? `Logged · ${score.label}` : 'Logged · extra run'}</span>
          <span style={{ fontSize: 12, color: 'var(--body-2)' }}>
            {formatDistanceWithUnit(run.distanceKm, units)} in {formatDuration(run.durationSec)}
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 2px', borderTop: '1px solid var(--divider)', fontSize: 12.5 }}>
            <span style={{ width: 58, color: 'var(--muted)', flex: 'none' }}>{r.label}</span>
            <span style={{ fontWeight: 700, flex: 'none' }}>{r.actual}</span>
            <span style={{ flex: 1, textAlign: 'right', color: r.good ? 'var(--muted)' : 'var(--accent-text)' }}>{r.note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
