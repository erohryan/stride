import { formatDistance, formatDuration, formatPace, parseDuration } from '@shared/format'
import type { GoalOptions, Units } from '@shared/types'

export type GoalChoice = 'comfortable' | 'realistic' | 'stretch' | 'own'

const OPTIONS: { id: Exclude<GoalChoice, 'own'>; title: string; blurb: string }[] = [
  { id: 'comfortable', title: 'Comfortable', blurb: 'Finish strong, with room to spare' },
  { id: 'realistic', title: 'Realistic · matches your prediction', blurb: 'Even pacing, close to race effort in training' },
  { id: 'stretch', title: 'Stretch', blurb: 'Needs a strong build phase and a good day' }
]

interface Props {
  options: GoalOptions
  distanceKm: number
  units: Units
  choice: GoalChoice
  ownTime: string
  onChoose: (c: GoalChoice) => void
  onOwnTime: (t: string) => void
}

/** The goal seconds a choice stands for, or null when "my own time" isn't a valid time yet. */
export function goalSeconds(options: GoalOptions, choice: GoalChoice, ownTime: string): number | null {
  if (choice !== 'own') return options[choice]
  const s = parseDuration(ownTime)
  return s && s > 0 ? s : null
}

export function GoalPicker({ options, distanceKm, units, choice, ownTime, onChoose, onOwnTime }: Props): React.JSX.Element {
  const goal = goalSeconds(options, choice, ownTime)
  const ownInvalid = choice === 'own' && ownTime.trim() !== '' && goal === null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {OPTIONS.map((o) => {
          const on = choice === o.id
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} className="radio-row" onClick={() => onChoose(o.id)}>
              <span className="radio-dot" />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{o.title}</span>
                <span style={{ fontSize: 12, color: on ? 'var(--body-2)' : 'var(--muted)' }}>{o.blurb}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span className="display" style={{ fontSize: 22, fontWeight: 700 }}>
                  {formatDuration(options[o.id])}
                </span>
                <span style={{ fontSize: 11.5, color: on ? 'var(--body-2)' : 'var(--muted)' }}>{formatPace(options[o.id] / distanceKm, units)}</span>
              </span>
            </button>
          )
        })}
        <div
          role="radio"
          aria-checked={choice === 'own'}
          className="radio-row"
          style={choice === 'own' ? { padding: '12px 16px' } : { padding: '12px 16px', background: 'transparent', boxShadow: 'inset 0 0 0 1.5px var(--ring)' }}
          onClick={() => onChoose('own')}
        >
          <span className="radio-dot" />
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>My own time</span>
          <input
            value={ownTime}
            placeholder="h:mm:ss"
            onFocus={() => onChoose('own')}
            onChange={(e) => onOwnTime(e.target.value)}
            style={{
              width: 96,
              padding: '6px 12px',
              borderRadius: 10,
              border: 0,
              outline: 0,
              background: ownInvalid ? 'var(--card)' : 'var(--inset)',
              boxShadow: ownInvalid ? 'inset 0 0 0 1.5px var(--apricot)' : undefined,
              fontFamily: 'var(--display)',
              fontSize: 15,
              fontWeight: 600,
              textAlign: 'center'
            }}
          />
        </div>
      </div>

      {goal !== null && <RacePacing goalSeconds={goal} distanceKm={distanceKm} units={units} />}
    </div>
  )
}

/** Race-day pacing in four segments: settle in, hold, press, kick. */
export function RacePacing({ goalSeconds, distanceKm, units }: { goalSeconds: number; distanceKm: number; units: Units }): React.JSX.Element {
  const g = goalSeconds / distanceKm
  const b = [0, Math.round(distanceKm * 0.237), Math.round(distanceKm * 0.711), Math.floor(distanceKm * 0.948), distanceKm]
  const factors = [1.013, 1, 0.99, 0.957]
  const unit = units === 'metric' ? 'km' : 'mi'
  const segs = factors.map((f, i) => ({
    label: i === 3 ? `Last ${formatDistance(b[4] - b[3], units)}` : `${formatDistance(b[i], units)}–${formatDistance(b[i + 1], units)} ${unit}`,
    pace: formatPace(g * f, units).replace(/ \/(km|mi)$/, '')
  }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Race-day pacing at {formatDuration(goalSeconds)}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {segs.map((s) => (
          <div key={s.label} style={{ background: 'var(--inset)', borderRadius: 14, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{s.pace}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
