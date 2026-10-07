// Scoring a logged run against its planned session, and the training load it applied.
// Load is session RPE (Foster): minutes × effort (1–10).
import { addDays } from './dates'
import { sessionSeconds } from './plan-view'
import type { ISODate, Run, Session, SessionType } from './types'

/** The effort (1–10) each kind of session should feel like. */
export const EXPECTED_EFFORT: Record<SessionType, [number, number]> = {
  recovery: [1, 3],
  easy: [2, 4],
  long: [3, 5],
  other: [3, 6],
  tempo: [6, 8],
  intervals: [7, 9],
  race: [8, 10],
  rest: [1, 2]
}

export const runLoad = (r: Pick<Run, 'durationSec' | 'effort'>): number => Math.round((r.durationSec / 60) * r.effort)

/** What a session should cost: its expected minutes at the middle of its expected effort. */
export function plannedLoad(s: Session): number | null {
  const sec = sessionSeconds(s)
  if (sec === null) return null
  const [lo, hi] = EXPECTED_EFFORT[s.type]
  return Math.round((sec / 60) * ((lo + hi) / 2))
}

export type ScoreLabel = 'Spot on' | 'On plan' | 'Close' | 'Off plan'

export interface RunScore {
  /** 0–100; null for a run with no planned session that day. */
  total: number | null
  label: ScoreLabel | null
  distance: { score: number; actualKm: number; plannedKm: number } | null
  /** diffSec > 0 means slower than planned. */
  pace: { score: number; actual: number; planned: number; diffSec: number } | null
  effort: { score: number; actual: number; expected: [number, number] } | null
  type: { score: number; matches: boolean } | null
  load: { actual: number; planned: number | null; ratio: number | null }
}

const clamp = (n: number): number => Math.max(0, Math.min(100, n))

export function labelFor(total: number): ScoreLabel {
  return total >= 90 ? 'Spot on' : total >= 75 ? 'On plan' : total >= 60 ? 'Close' : 'Off plan'
}

/** Scores `run` against the session planned for its day (if any). */
export function scoreRun(run: Run, session: Session | null): RunScore {
  const actualLoad = runLoad(run)
  if (!session || session.type === 'rest') {
    return { total: null, label: null, distance: null, pace: null, effort: null, type: null, load: { actual: actualLoad, planned: null, ratio: null } }
  }

  // Distance: within 5% is perfect; every further 1% off costs 2 points.
  const off = Math.abs(run.distanceKm / session.distanceKm - 1)
  const distance = { score: clamp(100 - Math.max(0, off - 0.05) * 200), actualKm: run.distanceKm, plannedKm: session.distanceKm }

  // Pace against the session's expected average (warm-ups and recoveries included).
  const plannedSec = sessionSeconds(session)
  const plannedPace = plannedSec ? plannedSec / session.distanceKm : session.targetPaceSecPerKm
  let pace: RunScore['pace'] = null
  if (plannedPace) {
    const actual = run.durationSec / run.distanceKm
    const diffSec = Math.round(actual - plannedPace)
    // Steady runs can drift slower freely but shouldn't be pushed; quality runs should hit the pace.
    const steady = ['easy', 'recovery', 'long', 'other'].includes(session.type)
    const [fast, slow] = steady ? [-10, 30] : [-10, 15]
    const beyond = diffSec < fast ? fast - diffSec : diffSec > slow ? diffSec - slow : 0
    const perSec = steady && diffSec > slow ? 1 : 2
    pace = { score: clamp(100 - beyond * perSec), actual, planned: plannedPace, diffSec }
  }

  // Effort: inside the expected band is perfect; each point outside costs 25.
  const expected = EXPECTED_EFFORT[session.type]
  const outside = run.effort < expected[0] ? expected[0] - run.effort : run.effort > expected[1] ? run.effort - expected[1] : 0
  const effort = { score: clamp(100 - outside * 25), actual: run.effort, expected }

  // Type: easy and recovery are interchangeable; otherwise doing a different session costs.
  const same = run.type === session.type || (['easy', 'recovery'].includes(run.type) && ['easy', 'recovery'].includes(session.type))
  const type = { score: same ? 100 : 50, matches: same }

  const parts: [number, number][] = [
    [distance.score, 0.4],
    ...(pace ? ([[pace.score, 0.35]] as [number, number][]) : []),
    [effort.score, 0.15],
    [type.score, 0.1]
  ]
  const weight = parts.reduce((a, [, w]) => a + w, 0)
  const total = Math.round(parts.reduce((a, [s, w]) => a + s * w, 0) / weight)

  const planned = plannedLoad(session)
  return {
    total,
    label: labelFor(total),
    distance,
    pace,
    effort,
    type,
    load: { actual: actualLoad, planned, ratio: planned ? actualLoad / planned : null }
  }
}

/** The session a run is scored against: the non-rest session on its day. */
export function sessionFor(run: Run, sessions: Session[]): Session | null {
  return sessions.find((s) => s.date === run.date && s.type !== 'rest') ?? null
}

/** A week's load so far against what the week planned. */
export function weekLoad(start: ISODate, sessions: Session[], runs: Run[]): { actual: number; planned: number } {
  const end = addDays(start, 7)
  const inWeek = <T extends { date: ISODate }>(x: T): boolean => x.date >= start && x.date < end
  return {
    actual: runs.filter(inWeek).reduce((a, r) => a + runLoad(r), 0),
    planned: sessions.filter(inWeek).reduce((a, s) => a + (s.type === 'rest' ? 0 : (plannedLoad(s) ?? 0)), 0)
  }
}

/** "+50% vs plan", "on plan", "−20% vs plan". */
export function loadDelta(ratio: number | null): string {
  if (ratio === null) return 'unplanned'
  const pct = Math.round((ratio - 1) * 100)
  if (Math.abs(pct) <= 10) return 'on plan'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% vs plan`
}
