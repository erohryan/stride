// Data model shared by main, preload and renderer.
// Everything is stored in metric; the renderer converts for display.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sunday, matches Date#getDay
export type Units = 'metric' | 'imperial'
export type ISODate = string // YYYY-MM-DD, local date

export interface Location {
  name: string
  lat: number
  lon: number
}

export interface Profile {
  name: string
  weeklyKm: number // typical weekly volume right now
  longestRecentKm: number // longest run in the last ~4 weeks
  recentRace: { distanceKm: number; durationSec: number; date: ISODate } | null
  location: Location | null
  age: number | null
  maxHr: number | null
}

export interface Settings {
  units: Units
  runDays: Weekday[]
  longRunDay: Weekday
  /** Nudge to log a planned run the morning after it was due. */
  reminders: { enabled: boolean; hour: number }
}

export interface Race {
  id: string
  name: string
  date: ISODate
  distanceKm: number
  goalSeconds: number
  location: Location | null
}

export type Phase = 'base' | 'build' | 'peak' | 'taper'

export interface PlanWeek {
  index: number // 1-based
  startDate: ISODate
  phase: Phase
  plannedKm: number
}

export type SessionType =
  | 'easy'
  | 'tempo'
  | 'intervals'
  | 'long'
  | 'recovery'
  | 'race'
  | 'rest'
  | 'other'

export interface Step {
  label: 'warmup' | 'main' | 'cooldown' | 'rep' | 'recovery'
  distanceKm?: number
  durationSec?: number
  paceSecPerKm?: number
  repeat?: number
}

export interface Session {
  id: string
  date: ISODate
  type: SessionType
  distanceKm: number
  targetPaceSecPerKm?: number
  structure: Step[]
  notes?: string
  status: 'planned' | 'done' | 'skipped'
  movedFrom?: ISODate
}

export type RunType = 'easy' | 'tempo' | 'intervals' | 'long' | 'recovery' | 'race' | 'other'

export interface Run {
  id: string
  date: ISODate
  startTime?: string // HH:MM
  type: RunType
  distanceKm: number
  durationSec: number
  avgHr?: number
  elevationM?: number
  effort: number // 1–10
  splits: number[] // seconds per km
  notes?: string
  source: 'manual' | 'screenshot'
  /** Copies kept in <userData>/screenshots. */
  screenshotPaths?: string[]
  isBenchmark: boolean
}

export interface PredictionTimes {
  '5k': number
  '10k': number
  half: number
  marathon: number
}

export interface Prediction {
  computedAt: string // ISO timestamp
  times: PredictionTimes
  raceDistanceSeconds: number
}

export interface GoalOptions {
  comfortable: number
  realistic: number
  stretch: number
}

export interface ChangeSet {
  id: string
  createdAt: string
  kind: 'weather' | 'run' | 'goal' | 'settings'
  reason: string
  before: Session[]
  after: Session[]
  reverted: boolean
  /** A later re-plan replaced sessions this change made, so it can no longer be undone. */
  superseded?: boolean
}

export interface HourlyForecast {
  time: string // ISO local, e.g. 2026-10-06T06:00
  tempC: number
  windKph: number
  windDir: number
  precipPct: number
  condition: string
}

export interface Forecast {
  date: ISODate
  hourly: HourlyForecast[]
}

export type RefreshState = { running: boolean; queued: number; lastRunAt: string | null; error: string | null }

/** Everything the renderer needs to draw any screen. */
export interface AppState {
  profile: Profile | null
  settings: Settings
  race: Race | null
  weeks: PlanWeek[]
  sessions: Session[]
  runs: Run[]
  prediction: Prediction | null
  predictionHistory: Prediction[]
  goalOptions: GoalOptions | null
  changeSets: ChangeSet[]
  forecast: Forecast[]
  refresh: RefreshState
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'metric',
  runDays: [0, 2, 3, 4, 6],
  longRunDay: 0,
  reminders: { enabled: true, hour: 8 }
}
