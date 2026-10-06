// Pure helpers that turn stored plan data into what the screens show.
import { addDays, daysBetween, parseISODate } from './dates'
import { formatDistance, formatDuration, formatPace, MONTHS, MONTHS_LONG, weekdayLong } from './format'
import type { ChangeSet, ISODate, Phase, PlanWeek, Prediction, Race, Run, Session, SessionType, Step, Units } from './types'

const KEY: SessionType[] = ['tempo', 'intervals', 'long', 'race']
/** Key sessions get the apricot accent. */
export const isKey = (t: SessionType): boolean => KEY.includes(t)

/** "Easy run" — the Today card and Coming up. */
export function sessionTitle(t: SessionType): string {
  return { easy: 'Easy run', tempo: 'Tempo', intervals: 'Intervals', long: 'Long run', recovery: 'Recovery', race: 'Race day', rest: 'Rest', other: 'Run' }[t]
}

/** "Easy" — day tiles. */
export function sessionShort(t: SessionType): string {
  return { easy: 'Easy', tempo: 'Tempo', intervals: 'Intervals', long: 'Long', recovery: 'Recovery', race: 'Race', rest: 'Rest', other: 'Run' }[t]
}

export const PHASE_LABEL: Record<Phase, string> = { base: 'Base', build: 'Build', peak: 'Peak', taper: 'Taper' }
export const PHASE_CAPTION: Record<Phase, string> = { base: 'Base building', build: 'Building', peak: 'Peak weeks', taper: 'Taper' }

/** The plan week containing `date`, clamped to the plan. */
export function weekIndexFor(weeks: PlanWeek[], date: ISODate): number {
  if (weeks.length === 0) return 0
  for (let i = weeks.length - 1; i >= 0; i--) if (weeks[i].startDate <= date) return i
  return 0
}

export interface Day {
  date: ISODate
  session: Session | null
  run: Run | null
  isToday: boolean
  isPast: boolean
}

/** The seven days of a week, Monday first. */
export function weekDays(start: ISODate, sessions: Session[], runs: Run[], today: ISODate): Day[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    return {
      date,
      session: sessions.find((s) => s.date === date) ?? null,
      run: runs.find((r) => r.date === date) ?? null,
      isToday: date === today,
      isPast: date < today
    }
  })
}

export const isDone = (d: Day): boolean => d.session?.status === 'done' || d.run !== null

/** The next `n` sessions after today. */
export function upcoming(sessions: Session[], today: ISODate, n = 4): Session[] {
  return sessions.filter((s) => s.date > today && s.type !== 'rest').slice(0, n)
}

/** Seconds a step takes, counting repeats. */
function stepSeconds(step: Step, fallbackPace?: number): number | null {
  const reps = step.repeat ?? 1
  if (step.durationSec) return step.durationSec * reps
  const pace = step.paceSecPerKm ?? fallbackPace
  if (step.distanceKm && pace) return step.distanceKm * pace * reps
  return null
}

/** Roughly how long a session takes. */
export function sessionSeconds(s: Session): number | null {
  // Warm-ups and cool-downs without a pace run at easy-ish pace.
  const easyish = s.targetPaceSecPerKm ? s.targetPaceSecPerKm + (isKey(s.type) && s.type !== 'long' ? 60 : 0) : undefined
  if (s.structure.length > 0) {
    let total = 0
    for (const step of s.structure) {
      const t = stepSeconds(step, step.label === 'warmup' || step.label === 'cooldown' || step.label === 'recovery' ? easyish : s.targetPaceSecPerKm)
      if (t === null) return s.targetPaceSecPerKm ? s.distanceKm * s.targetPaceSecPerKm : null
      total += t
    }
    return total
  }
  return s.targetPaceSecPerKm ? s.distanceKm * s.targetPaceSecPerKm : null
}

/** "about 47 min" / "about 1 h 32 min". */
export function aboutDuration(sec: number | null): string | null {
  if (sec === null) return null
  const min = Math.round(sec / 60)
  if (min < 60) return `about ${min} min`
  return `about ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

/** 0.8 → "800 m", 6 → "6 km". */
export function stepDistance(km: number, units: Units): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${formatDistance(km, units)} ${units === 'metric' ? 'km' : 'mi'}`
}

const paceOnly = (sec: number, units: Units): string => formatPace(sec, units).replace(/ \/(km|mi)$/, '')

/** The tile's second line: pace for steady runs, the main set for quality ones. "6 km @ 4:50", "6 × 800 m". */
export function sessionSummary(s: Session, units: Units): string {
  const reps = s.structure.find((x) => x.label === 'rep')
  if (reps) {
    const amount = reps.distanceKm ? stepDistance(reps.distanceKm, units) : reps.durationSec ? `${Math.round(reps.durationSec / 60)} min` : ''
    return `${reps.repeat ?? 1} × ${amount}`
  }
  const main = s.structure.find((x) => x.label === 'main')
  if (main && main.distanceKm && main.paceSecPerKm && isKey(s.type) && s.type !== 'long' && main.distanceKm < s.distanceKm) {
    return `${stepDistance(main.distanceKm, units)} @ ${paceOnly(main.paceSecPerKm, units)}`
  }
  return s.targetPaceSecPerKm ? formatPace(s.targetPaceSecPerKm, units) : ''
}

export interface StructureRow {
  label: string
  detail: string
  main: boolean
}

/** Rows for the detail panel's structure list. */
export function structureRows(s: Session, units: Units): StructureRow[] {
  if (s.structure.length === 0) {
    return [{ label: sessionShort(s.type), detail: `${stepDistance(s.distanceKm, units)}${s.targetPaceSecPerKm ? ` @ ${paceOnly(s.targetPaceSecPerKm, units)}` : ''}`, main: true }]
  }
  return s.structure.map((step) => {
    const amount = step.distanceKm ? stepDistance(step.distanceKm, units) : step.durationSec ? formatDuration(step.durationSec) : ''
    const reps = step.repeat && step.repeat > 1 ? `${step.repeat} × ` : ''
    const pace = step.paceSecPerKm ? ` @ ${paceOnly(step.paceSecPerKm, units)}` : step.label === 'recovery' ? ' jog' : ''
    const label = { warmup: 'Warm-up', cooldown: 'Cool-down', recovery: 'Recovery', rep: 'Reps', main: sessionShort(s.type) }[step.label]
    return { label, detail: `${reps}${amount}${pace}`, main: step.label === 'main' || step.label === 'rep' }
  })
}

/** "5 – 11 October" or "28 Sep – 4 Oct". */
export function weekRange(start: ISODate): string {
  const a = parseISODate(start)
  const b = parseISODate(addDays(start, 6))
  const long = (d: Date): string => MONTHS_LONG[d.getMonth()]
  const short = (d: Date): string => MONTHS[d.getMonth()]
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${long(b)}`
  return `${a.getDate()} ${short(a)} – ${b.getDate()} ${short(b)}`
}

/** "61 days", "1 day", "Race day". */
export function countdown(today: ISODate, race: Race): string {
  const d = daysBetween(today, race.date)
  if (d === 0) return 'Race day'
  if (d === 1) return '1 day'
  return `${d} days`
}

/** How the prediction compares with the goal: "On track", "1:20 behind goal", "Ahead of goal". */
export function predictionStatus(prediction: Prediction | null, goalSeconds: number): string {
  if (!prediction) return 'Not predicted yet'
  const diff = prediction.raceDistanceSeconds - goalSeconds
  if (diff <= 60 && diff >= -120) return 'On track'
  if (diff < -120) return 'Ahead of goal'
  return `${formatDuration(diff)} behind goal`
}

/** The weather change still in force that touches the next 7 days, newest first. */
export function activeWeatherChange(changeSets: ChangeSet[], today: ISODate): ChangeSet | null {
  const end = addDays(today, 6)
  return (
    changeSets.find(
      (c) => c.kind === 'weather' && !c.reverted && !c.superseded && [...c.after, ...c.before].some((s) => s.date >= today && s.date <= end)
    ) ?? null
  )
}

/** "Plan adjusted for the heat" — from the change's reason. */
export function weatherNoteTitle(reason: string): string {
  const r = reason.toLowerCase()
  if (/storm|thunder/.test(r)) return 'Plan adjusted for storms'
  if (/rain|shower|wet/.test(r)) return 'Plan adjusted for the rain'
  if (/wind|gust/.test(r)) return 'Plan adjusted for the wind'
  if (/heat|hot|°|warm/.test(r)) return 'Plan adjusted for the heat'
  return 'Plan adjusted for the weather'
}

/** "We swapped Wednesday and Thursday" / "We moved Thursday's tempo to Wednesday" / "We adjusted Thursday". */
export function changeHeadline(cs: ChangeSet): string {
  const moved = cs.after.filter((s) => s.movedFrom && s.movedFrom !== s.date)
  const day = (d: ISODate): string => weekdayLong(parseISODate(d).getDay())
  if (moved.length >= 2) {
    const [a, b] = moved
    if (a.movedFrom === b.date && b.movedFrom === a.date) {
      const [x, y] = [a.date, b.date].sort()
      return `We swapped ${day(x)} and ${day(y)}`
    }
  }
  if (moved.length >= 1) {
    const m = moved[0]
    return `We moved ${day(m.movedFrom!)}'s ${sessionShort(m.type).toLowerCase()} to ${day(m.date)}`
  }
  const dates = [...new Set([...cs.after, ...cs.before].map((s) => s.date))].sort()
  if (dates.length === 1) return `We adjusted ${day(dates[0])}`
  return 'We adjusted your week'
}

/** "6:02 am". */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])\.?m\.?/i, ' $1m').toLowerCase()
}

/** Dates whose session differs between before and after — the tiles that changed. */
export function changedDates(cs: ChangeSet | null): Set<ISODate> {
  if (!cs) return new Set()
  return new Set(cs.after.filter((s) => s.movedFrom || cs.before.some((b) => b.date === s.date)).map((s) => s.date))
}

/** Planned runs from the last `days` days that were neither logged nor skipped. */
export function unloggedSessions(sessions: Session[], runs: Run[], today: ISODate, days = 7): Session[] {
  const from = addDays(today, -days)
  const ran = new Set(runs.map((r) => r.date))
  return sessions.filter((s) => s.date < today && s.date >= from && s.type !== 'rest' && s.status === 'planned' && !ran.has(s.date))
}

/** "yesterday's easy run", "Saturday's long run". */
export function sessionDayName(s: Session, today: ISODate): string {
  const when = s.date === addDays(today, -1) ? 'yesterday' : weekdayLong(parseISODate(s.date).getDay())
  return `${when}'s ${sessionTitle(s.type).toLowerCase()}`
}
