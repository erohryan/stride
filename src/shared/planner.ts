// The contract between the app and the stride-planner skill, plus checks on what comes back.
import { addDays, daysBetween, parseISODate } from './dates'
import type {
  ChangeSet,
  Forecast,
  GoalOptions,
  ISODate,
  PlanWeek,
  PredictionTimes,
  Profile,
  Race,
  Run,
  Session,
  SessionType,
  Settings
} from './types'

export type PlannerTask = 'build_plan' | 'refresh' | 'predict' | 'parse_screenshot'

export interface PlannerRequest {
  task: PlannerTask
  today: ISODate
  /** Monday of the week the plan starts (build_plan only). */
  planStart?: ISODate
  profile: Profile | null
  race: Race | null
  settings: Settings
  plan: { weeks: PlanWeek[]; sessions: Session[] }
  recentRuns: Run[]
  benchmarkRun: Run | null
  forecast: Forecast[]
  revertedChangeSets: ChangeSet[]
  /** Why this run is happening, so the planner knows where to look. */
  trigger?: RefreshTrigger[]
  /** Screenshots to read (parse_screenshot only). */
  imagePaths?: string[]
}

export type RefreshTrigger = 'manual' | 'scheduled' | 'run_logged' | 'run_deleted' | 'goal_changed' | 'settings_changed' | 'benchmark_changed'

/** A session as the skill writes it: no status, id only when it continues an existing session. */
export type PlannedSession = Omit<Session, 'status' | 'id'> & { id?: string }

export interface PlannerChange {
  kind: 'weather' | 'run' | 'goal' | 'settings'
  reason: string
  dates: ISODate[]
}

export interface ParsedRun {
  /** Which of the request's imagePaths (0-based) show this run. */
  imageIndexes: number[]
  type?: 'easy' | 'tempo' | 'intervals' | 'long' | 'recovery' | 'race' | 'other'
  date?: ISODate
  startTime?: string
  distanceKm?: number
  durationSec?: number
  avgPaceSecPerKm?: number
  avgHr?: number
  elevationM?: number
  splits?: number[]
  unreadable: string[]
}

export interface PlannerResponse {
  sessions?: PlannedSession[]
  weeks?: PlanWeek[]
  prediction?: PredictionTimes
  goalOptions?: GoalOptions
  changes?: PlannerChange[]
  parsedRuns?: ParsedRun[]
}

// ── JSON schemas for --json-schema ──────────────────────

const STEP_SCHEMA = {
  type: 'object',
  properties: {
    label: { enum: ['warmup', 'main', 'cooldown', 'rep', 'recovery'] },
    distanceKm: { type: 'number' },
    durationSec: { type: 'number' },
    paceSecPerKm: { type: 'number' },
    repeat: { type: 'integer' }
  },
  required: ['label']
}

const SESSION_TYPES: Exclude<SessionType, 'rest'>[] = ['easy', 'tempo', 'intervals', 'long', 'recovery', 'race', 'other']

const SESSION_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    type: { enum: SESSION_TYPES },
    distanceKm: { type: 'number' },
    targetPaceSecPerKm: { type: 'number' },
    structure: { type: 'array', items: STEP_SCHEMA },
    notes: { type: 'string' },
    movedFrom: { type: 'string' }
  },
  required: ['date', 'type', 'distanceKm', 'structure']
}

const WEEK_SCHEMA = {
  type: 'object',
  properties: {
    index: { type: 'integer' },
    startDate: { type: 'string' },
    phase: { enum: ['base', 'build', 'peak', 'taper'] },
    plannedKm: { type: 'number' }
  },
  required: ['index', 'startDate', 'phase', 'plannedKm']
}

const PREDICTION_SCHEMA = {
  type: 'object',
  properties: { '5k': { type: 'number' }, '10k': { type: 'number' }, half: { type: 'number' }, marathon: { type: 'number' } },
  required: ['5k', '10k', 'half', 'marathon']
}

const GOAL_SCHEMA = {
  type: 'object',
  properties: { comfortable: { type: 'number' }, realistic: { type: 'number' }, stretch: { type: 'number' } },
  required: ['comfortable', 'realistic', 'stretch']
}

const CHANGES_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      kind: { enum: ['weather', 'run', 'goal', 'settings'] },
      reason: { type: 'string' },
      dates: { type: 'array', items: { type: 'string' } }
    },
    required: ['kind', 'reason', 'dates']
  }
}

const PARSED_RUN_SCHEMA = {
  type: 'object',
  properties: {
    imageIndexes: { type: 'array', items: { type: 'integer' } },
    type: { enum: ['easy', 'tempo', 'intervals', 'long', 'recovery', 'race', 'other'] },
    date: { type: 'string' },
    startTime: { type: 'string' },
    distanceKm: { type: 'number' },
    durationSec: { type: 'number' },
    avgPaceSecPerKm: { type: 'number' },
    avgHr: { type: 'number' },
    elevationM: { type: 'number' },
    splits: { type: 'array', items: { type: 'number' } },
    unreadable: { type: 'array', items: { type: 'string' } }
  },
  required: ['imageIndexes', 'unreadable']
}

export function responseSchema(task: PlannerTask): object {
  const props: Record<string, object> = {
    sessions: { type: 'array', items: SESSION_SCHEMA },
    weeks: { type: 'array', items: WEEK_SCHEMA },
    prediction: PREDICTION_SCHEMA,
    goalOptions: GOAL_SCHEMA,
    changes: CHANGES_SCHEMA,
    parsedRuns: { type: 'array', items: PARSED_RUN_SCHEMA }
  }
  const required: Record<PlannerTask, string[]> = {
    build_plan: ['sessions', 'weeks', 'prediction', 'goalOptions', 'changes'],
    refresh: ['prediction', 'goalOptions', 'changes'],
    predict: ['prediction', 'goalOptions'],
    parse_screenshot: ['parsedRuns']
  }
  return { type: 'object', properties: props, required: required[task] }
}

// ── Validation ─────────────────────────────────────────

const HARD: SessionType[] = ['tempo', 'intervals', 'long', 'race']
export const isHard = (t: SessionType): boolean => HARD.includes(t)

/**
 * Checks a full replacement of sessions from `today` against the training rules.
 * `history` holds sessions before today, so the rules hold across the boundary.
 * Returns human-readable violations; empty means the plan is acceptable.
 */
export function validatePlan(opts: {
  today: ISODate
  race: Race
  sessions: PlannedSession[]
  weeks: PlanWeek[]
  history?: Session[]
}): string[] {
  const { today, race, sessions, weeks } = opts
  const problems: string[] = []
  const byDate = new Map<ISODate, PlannedSession | Session>()
  for (const s of opts.history ?? []) if (s.date < today) byDate.set(s.date, s)

  for (const s of sessions) {
    if (s.date < today) problems.push(`${s.date}: session is in the past`)
    if (s.date > race.date) problems.push(`${s.date}: session is after race day`)
    if (byDate.has(s.date) && s.date >= today) problems.push(`${s.date}: more than one session on this day`)
    if (!(s.distanceKm > 0)) problems.push(`${s.date}: distance must be above 0`)
    byDate.set(s.date, s)
  }

  const raceDay = byDate.get(race.date)
  if (!raceDay || raceDay.type !== 'race') problems.push(`${race.date}: race day must hold a "race" session`)

  for (const s of sessions) {
    const prev = byDate.get(addDays(s.date, -1))
    if (prev && isHard(s.type) && isHard(prev.type)) {
      problems.push(`${prev.date} and ${s.date}: two hard days in a row (${prev.type}, ${s.type})`)
    }
    if (s.type === 'long' && prev && !['easy', 'recovery'].includes(prev.type)) {
      problems.push(`${s.date}: the day before a long run must be rest or easy (found ${prev.type})`)
    }
  }

  // Weekly volume: weeks that start today or later must match their plannedKm within 10%.
  for (const w of weeks) {
    if (w.startDate < today) continue
    const end = addDays(w.startDate, 7)
    const km = sessions.filter((s) => s.date >= w.startDate && s.date < end).reduce((a, s) => a + s.distanceKm, 0)
    if (w.plannedKm > 0 && Math.abs(km - w.plannedKm) / w.plannedKm > 0.1) {
      problems.push(`week ${w.index}: sessions add up to ${km.toFixed(1)} km but plannedKm is ${w.plannedKm}`)
    }
  }

  // Weeks must be contiguous Mondays.
  weeks.forEach((w, i) => {
    if (parseISODate(w.startDate).getDay() !== 1) problems.push(`week ${w.index}: startDate ${w.startDate} is not a Monday`)
    if (i > 0 && daysBetween(weeks[i - 1].startDate, w.startDate) !== 7) problems.push(`week ${w.index}: not 7 days after week ${weeks[i - 1].index}`)
  })

  return problems
}

/** Monday on or before the given date. */
export function mondayOf(date: ISODate): ISODate {
  const dow = parseISODate(date).getDay()
  return addDays(date, -((dow + 6) % 7))
}
