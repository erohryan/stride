import { useState, type ReactNode } from 'react'
import { daysBetween, todayISO } from '@shared/dates'
import { formatDayDate, formatDistance, formatDuration, parseDuration, RACE_DISTANCES, toKm, weekdayLong } from '@shared/format'
import type { AppState, GoalOptions, Location, Profile, Race, Settings, Units, Weekday } from '@shared/types'
import { GoalPicker, goalSeconds, type GoalChoice } from '../components/GoalPicker'
import { Field, PlaceSearch, RunDays, runDaysHint, Segmented, Spinner, TextInput, useElapsed, WeekdaySelect } from '../components/ui'

// ── Shared layout ──────────────────────────────────────

function Hero({ step, title, subtitle }: { step?: string; title: string; subtitle: string }): React.JSX.Element {
  return (
    <div style={{ background: 'var(--hero)', borderRadius: 26, padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {step && (
        <span style={{ alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 999, background: 'rgba(255,253,249,.75)', fontSize: 12, fontWeight: 600 }}>{step}</span>
      )}
      <span className="display" style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {title}
      </span>
      <span style={{ fontSize: 15, color: 'var(--body-2)' }}>{subtitle}</span>
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="card-title">{title}</span>
        {subtitle && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}

function Page({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div style={{ height: '100%', overflowY: 'auto', margin: '0 -22px', padding: '0 22px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 4 }} className="fade-in">
        {children}
      </div>
    </div>
  )
}

const num = (s: string): number | null => {
  const n = Number(s.replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

// ── Step 1: about you ──────────────────────────────────

export function AboutYou({ state, onDone }: { state: AppState; onDone: () => void }): React.JSX.Element {
  const p = state.profile
  const [units, setUnits] = useState<Units>(state.settings.units)
  const show = (km: number): string => formatDistance(km, units)
  const [name, setName] = useState(p?.name ?? '')
  const [location, setLocation] = useState<Location | null>(p?.location ?? null)
  const [age, setAge] = useState(p?.age ? String(p.age) : '')
  const [maxHr, setMaxHr] = useState(p?.maxHr ? String(p.maxHr) : '')
  const [weekly, setWeekly] = useState(p ? show(p.weeklyKm) : '')
  const [longest, setLongest] = useState(p ? show(p.longestRecentKm) : '')
  const [raceDist, setRaceDist] = useState(p?.recentRace ? (RACE_DISTANCES.find((d) => Math.abs(d.km - p.recentRace!.distanceKm) < 0.05)?.id ?? '10k') : '10k')
  const [raceTime, setRaceTime] = useState(p?.recentRace ? formatDuration(p.recentRace.durationSec) : '')
  const [raceDate, setRaceDate] = useState(p?.recentRace?.date ?? '')
  const [runDays, setRunDays] = useState<Weekday[]>(state.settings.runDays)
  const [longRunDay, setLongRunDay] = useState<Weekday>(state.settings.longRunDay)
  const [tried, setTried] = useState(false)
  const unit = units === 'metric' ? 'km' : 'mi'

  const errors = {
    name: name.trim() ? null : 'Add your name',
    location: location ? null : 'Pick a place from the list, for the forecast',
    weekly: num(weekly) !== null ? null : 'Roughly how far you run in a week',
    longest: num(longest) !== null ? null : 'Your longest run lately',
    raceTime: raceTime.trim() && !parseDuration(raceTime) ? 'Use h:mm:ss or mm:ss' : null,
    raceDate: raceTime.trim() && raceDate > todayISO() ? 'That date is in the future' : null,
    runDays: runDays.length < 2 ? 'Pick at least two days' : !runDays.includes(longRunDay) ? `${weekdayLong(longRunDay)} isn't one of your run days` : null,
    age: age.trim() && !(num(age)! >= 10 && num(age)! <= 100) ? 'Between 10 and 100' : null,
    maxHr: maxHr.trim() && !(num(maxHr)! >= 120 && num(maxHr)! <= 230) ? 'Between 120 and 230 bpm' : null
  }
  const valid = Object.values(errors).every((e) => e === null)
  const err = (k: keyof typeof errors): string | null => (tried ? errors[k] : null)

  const save = async (): Promise<void> => {
    setTried(true)
    if (!valid) return
    const profile: Profile = {
      name: name.trim(),
      weeklyKm: toKm(num(weekly)!, units),
      longestRecentKm: toKm(num(longest)!, units),
      recentRace: raceTime.trim()
        ? { distanceKm: RACE_DISTANCES.find((d) => d.id === raceDist)!.km, durationSec: parseDuration(raceTime)!, date: raceDate || todayISO() }
        : null,
      location,
      age: age.trim() ? num(age) : null,
      maxHr: maxHr.trim() ? num(maxHr) : null
    }
    const settings: Settings = { ...state.settings, units, runDays, longRunDay }
    await window.stride.saveSettings(settings)
    await window.stride.saveProfile(profile)
    onDone()
  }

  return (
    <Page>
      <Hero step="Step 1 of 2" title="Tell us about you" subtitle="A few details so your plan starts where your running is today." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18 }}>
        <Card title="You">
          <Field label="First name" error={err('name')}>
            <TextInput value={name} onChange={setName} placeholder="Your first name" invalid={!!err('name')} autoFocus />
          </Field>
          <Field label="Units">
            <div>
              <Segmented
                value={units}
                onChange={setUnits}
                options={[
                  { value: 'metric', label: 'km · °C' },
                  { value: 'imperial', label: 'mi · °F' }
                ]}
              />
            </div>
          </Field>
          <Field label="Where you usually run" error={err('location')}>
            <PlaceSearch value={location} onChange={setLocation} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Age" optional error={err('age')}>
              <TextInput value={age} onChange={setAge} inputMode="numeric" placeholder="34" invalid={!!err('age')} />
            </Field>
            <Field label="Max heart rate" optional error={err('maxHr')}>
              <TextInput value={maxHr} onChange={setMaxHr} inputMode="numeric" placeholder="185" suffix="bpm" invalid={!!err('maxHr')} />
            </Field>
          </div>
        </Card>

        <Card title="Your running right now">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Usual weekly distance" error={err('weekly')}>
              <TextInput value={weekly} onChange={setWeekly} inputMode="decimal" placeholder="30" suffix={unit} invalid={!!err('weekly')} />
            </Field>
            <Field label="Longest run, last month" error={err('longest')}>
              <TextInput value={longest} onChange={setLongest} inputMode="decimal" placeholder="14" suffix={unit} invalid={!!err('longest')} />
            </Field>
          </div>
          <div className="divider" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>A recent race or time trial</span>
              <span className="hint">Optional. A hard effort from the last few months gives the best prediction.</span>
            </div>
            <div>
              <Segmented value={raceDist} onChange={setRaceDist} options={RACE_DISTANCES.map((d) => ({ value: d.id, label: d.label }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Time" error={err('raceTime')}>
                <TextInput value={raceTime} onChange={setRaceTime} placeholder="47:10" invalid={!!err('raceTime')} />
              </Field>
              <Field label="Date" error={err('raceDate')}>
                <TextInput type="date" value={raceDate} onChange={setRaceDate} invalid={!!err('raceDate')} />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Your week">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 40, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Run days</span>
              <span className={err('runDays') ? 'error-text' : 'hint'}>{err('runDays') ?? runDaysHint(runDays)}</span>
            </div>
            <RunDays value={runDays} onChange={setRunDays} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Long run day</span>
              <span className="hint">Weather can still move it a day either way</span>
            </div>
            <WeekdaySelect
              value={longRunDay}
              onChange={(d) => {
                setLongRunDay(d)
                if (!runDays.includes(d)) setRunDays([...runDays, d].sort())
              }}
            />
          </div>
        </div>
      </Card>

      <Footer>
        {tried && !valid && <span className="error-text">A few details need another look.</span>}
        <button className="btn-dark" style={{ padding: '11px 26px' }} onClick={save}>
          Continue
        </button>
      </Footer>
    </Page>
  )
}

function Footer({ children }: { children: ReactNode }): React.JSX.Element {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>{children}</div>
}

// ── Step 2: what are you training for ──────────────────

type DistanceId = '5k' | '10k' | 'half' | 'marathon' | 'custom'

export function RaceSetup({ state, onBack, onCancel }: { state: AppState; onBack?: () => void; onCancel?: () => void }): React.JSX.Element {
  const units = state.settings.units
  const unit = units === 'metric' ? 'km' : 'mi'
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [distance, setDistance] = useState<DistanceId>('half')
  const [customKm, setCustomKm] = useState('')
  const [location, setLocation] = useState<Location | null>(state.profile?.location ?? null)
  const [options, setOptions] = useState<GoalOptions | null>(null)
  const [choice, setChoice] = useState<GoalChoice>('realistic')
  const [ownTime, setOwnTime] = useState('')
  const [predicting, setPredicting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)

  const today = todayISO()
  const distanceKm = distance === 'custom' ? (num(customKm) !== null ? toKm(num(customKm)!, units) : 0) : RACE_DISTANCES.find((d) => d.id === distance)!.km
  const daysOut = date ? daysBetween(today, date) : 0
  const errors = {
    name: name.trim() ? null : 'Name your race',
    date: !date ? 'Pick the race date' : daysOut < 7 ? 'At least a week from today' : daysOut > 365 ? 'Within the next year' : null,
    distance: distanceKm >= 1 && distanceKm <= 100 ? null : 'Between 1 and 100 km'
  }
  const raceValid = Object.values(errors).every((e) => e === null)
  const err = (k: keyof typeof errors): string | null => (tried ? errors[k] : null)
  const goal = options ? goalSeconds(options, choice, ownTime) : null

  const draft = (goalSec: number): Race => ({
    id: crypto.randomUUID(),
    name: name.trim(),
    date,
    distanceKm,
    goalSeconds: goalSec,
    location: location ?? state.profile?.location ?? null
  })

  // Any change to the race makes the old suggestion stale.
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T): void => {
      set(v)
      setOptions(null)
    }

  const suggest = async (): Promise<void> => {
    setTried(true)
    if (!raceValid) return
    setPredicting(true)
    setError(null)
    try {
      const res = await window.stride.predict(draft(0))
      setOptions(res.goalOptions)
      setChoice('realistic')
    } catch (e) {
      setError(friendly(e))
    } finally {
      setPredicting(false)
    }
  }

  const build = async (): Promise<void> => {
    if (!raceValid || goal === null) return
    setError(null)
    // The app switches to the build screen as soon as the race is saved; errors show there.
    await window.stride.saveRace(draft(goal)).catch(() => undefined)
  }

  return (
    <Page>
      <Hero
        step={onBack ? 'Step 2 of 2' : undefined}
        title={onCancel ? 'A new race' : 'What are you training for?'}
        subtitle={onCancel ? 'Your runs stay. The plan is rebuilt for the new race, from this week to race day.' : "Pick your race. We'll build the plan backward from race day."}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18, alignItems: 'start' }}>
        <Card title="Your race">
          <Field label="Race name" error={err('name')}>
            <TextInput value={name} onChange={edit(setName)} placeholder="Victor Harbour Half Marathon" invalid={!!err('name')} autoFocus />
          </Field>
          <Field label="Date" error={err('date')}>
            <TextInput type="date" value={date} onChange={edit(setDate)} invalid={!!err('date')} />
          </Field>
          {date && !errors.date && (
            <span className="hint" style={{ marginTop: -10 }}>
              {Math.ceil(daysOut / 7)} weeks from today{daysOut < 42 ? '. A short plan, but we can still sharpen you up.' : '.'}
            </span>
          )}
          <Field label="Distance" error={err('distance')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Segmented
                value={distance}
                onChange={edit(setDistance)}
                options={[...RACE_DISTANCES.map((d) => ({ value: d.id as DistanceId, label: d.label })), { value: 'custom', label: 'Custom' }]}
              />
              {distance === 'custom' && <TextInput value={customKm} onChange={edit(setCustomKm)} inputMode="decimal" placeholder="30" suffix={unit} width={110} />}
            </div>
          </Field>
          <Field label="Race location">
            <PlaceSearch value={location} onChange={edit(setLocation)} placeholder="Where the race is" />
          </Field>
          <span className="hint" style={{ marginTop: -10 }}>
            Used for the race-day forecast.
          </span>
        </Card>

        <Card title="Your goal" subtitle={raceValid ? `${name.trim()} · ${formatDistance(distanceKm, units)} ${unit}` : 'Fill in your race, then we’ll suggest a goal.'}>
          {options ? (
            <>
              <GoalPicker options={options} distanceKm={distanceKm} units={units} choice={choice} ownTime={ownTime} onChoose={setChoice} onOwnTime={setOwnTime} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="hint" style={{ flex: 1 }}>
                  {error ?? 'You can change your goal any time. The plan rebuilds around it.'}
                </span>
                <button className="btn-dark" style={{ padding: '11px 22px' }} disabled={goal === null} onClick={build}>
                  Build my plan
                </button>
              </div>
            </>
          ) : (
            <div
              style={{
                border: '1.5px dashed var(--dashed)',
                borderRadius: 18,
                padding: '28px 22px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                textAlign: 'center'
              }}
            >
              <span className="hint" style={{ maxWidth: 300 }}>
                {predicting ? 'Working out what you can run on the day…' : 'We’ll predict your race time from your recent running and offer three goals to choose from.'}
              </span>
              <button className="btn-float" disabled={predicting} onClick={suggest}>
                {predicting && <Spinner />}
                {predicting ? 'Predicting…' : 'Suggest a goal'}
              </button>
              {error && <span className="error-text">{error}</span>}
            </div>
          )}
        </Card>
      </div>
      {(onBack || onCancel) && (
        <Footer>
          <button className="btn-float" style={{ marginRight: 'auto' }} onClick={onBack ?? onCancel}>
            {onBack ? 'Back' : 'Cancel'}
          </button>
        </Footer>
      )}
    </Page>
  )
}

// ── Building the plan ──────────────────────────────────

export function BuildingPlan({ state }: { state: AppState }): React.JSX.Element {
  const [startedAt] = useState(() => Date.now())
  const elapsed = useElapsed(state.refresh.running ? startedAt : null)
  const race = state.race!
  const weeks = Math.ceil(daysBetween(todayISO(), race.date) / 7)

  if (!state.refresh.running) {
    return (
      <Page>
        <Hero title="We couldn't build your plan" subtitle={state.refresh.error ? friendly(state.refresh.error) : 'The last attempt didn’t finish.'} />
        <Footer>
          <button className="btn-dark" style={{ padding: '11px 26px' }} onClick={() => window.stride.refresh()}>
            Try again
          </button>
        </Footer>
      </Page>
    )
  }

  return (
    <Page>
      <div style={{ background: 'var(--hero)', borderRadius: 26, padding: '40px 28px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
        <Spinner size={22} />
        <span className="display" style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
          Building your plan…
        </span>
        <span style={{ fontSize: 15, color: 'var(--body-2)', maxWidth: 560, lineHeight: 1.5 }}>
          {weeks} weeks of training, worked back from race day on {formatDayDate(race.date)}. This usually takes two to four minutes.
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · You can close this window. Stride keeps working from the menu bar.
        </span>
      </div>
    </Page>
  )
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  // IPC wraps main-process errors as "Error invoking remote method '…': Error: <message>".
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
