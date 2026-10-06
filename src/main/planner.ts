import { randomUUID } from 'crypto'
import { dirname } from 'path'
import { addDays, todayISO } from '@shared/dates'
import {
  mondayOf,
  responseSchema,
  validatePlan,
  type ParsedRun,
  type PlannedSession,
  type PlannerRequest,
  type RefreshTrigger,
  type PlannerResponse,
  type PlannerTask
} from '@shared/planner'
import type { ChangeSet, GoalOptions, Prediction, PredictionTimes, Race, Session } from '@shared/types'
import { callClaude, loadSkill } from './claude'
import type { Store } from './db'

export interface PlannerDeps {
  store: Store
  skillFile: string
  workDir: string
  /** Called whenever stored state or job status changes. */
  onChange: () => void
  /** Runs before each plan job (fetches a fresh forecast). Failures are ignored. */
  prepare?: () => Promise<void>
  /** Runs after a refresh or build is stored. */
  afterRefresh?: () => void
}

/** Time for the race distance, from the nearest standard distance via Riegel. */
export function raceSecondsFrom(times: PredictionTimes, km: number): number {
  const known: [number, number][] = [
    [5, times['5k']],
    [10, times['10k']],
    [21.0975, times.half],
    [42.195, times.marathon]
  ]
  const [d, t] = known.reduce((best, k) => (Math.abs(k[0] - km) < Math.abs(best[0] - km) ? k : best))
  return Math.round(t * Math.pow(km / d, 1.06))
}

export class Planner {
  private queue: Promise<unknown> = Promise.resolve()
  private pendingRefresh: Promise<void> | null = null
  private pendingTriggers = new Set<RefreshTrigger>()
  running = false
  queued = 0
  lastRunAt: string | null = null
  error: string | null = null

  constructor(private deps: PlannerDeps) {}

  /** Runs jobs one at a time, in order. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    this.queued++
    this.deps.onChange()
    const run = this.queue.then(async () => {
      this.queued--
      this.running = true
      this.error = null
      this.deps.onChange()
      try {
        const out = await job()
        this.lastRunAt = new Date().toISOString()
        return out
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.running = false
        this.deps.onChange()
      }
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Refreshes the plan. Requests made while one is already waiting share it (and its reasons). */
  refresh(trigger: RefreshTrigger = 'manual'): Promise<void> {
    this.pendingTriggers.add(trigger)
    if (this.pendingRefresh) return this.pendingRefresh
    const p = this.enqueue(async () => {
      this.pendingRefresh = null
      const triggers = [...this.pendingTriggers]
      this.pendingTriggers.clear()
      if (!this.deps.store.getActiveRace()) return
      // No plan yet (say the first build failed): build one instead.
      await this.runTask(this.deps.store.getWeeks().length ? 'refresh' : 'build_plan', triggers)
    })
    this.pendingRefresh = p
    p.catch(() => (this.pendingRefresh = null))
    return p
  }

  /** Builds a brand-new plan for the active race. */
  buildPlan(): Promise<void> {
    return this.enqueue(() => this.runTask('build_plan'))
  }

  /** Predicts times and goal options for a race that may not be saved yet. */
  predict(race: Race): Promise<{ prediction: PredictionTimes; goalOptions: GoalOptions }> {
    return this.enqueue(async () => {
      const res = await this.call(this.request('predict', race), 'predict')
      if (!res.prediction || !res.goalOptions) throw new Error('The prediction came back incomplete.')
      return { prediction: res.prediction, goalOptions: res.goalOptions }
    })
  }

  /**
   * Reads one or more screenshots and returns the runs found in them, grouped by run.
   * Doesn't touch the plan, so it runs straight away rather than waiting behind a refresh.
   */
  async parseScreenshots(imagePaths: string[]): Promise<ParsedRun[]> {
    const req = { ...this.request('parse_screenshot'), imagePaths }
    const res = await this.call(req, 'parse_screenshot')
    const runs = res.parsedRuns ?? []
    if (runs.length === 0) throw new Error("Couldn't read this screenshot.")
    return runs
  }

  /** Restores the sessions a change set replaced. */
  undo(changeSetId: string): void {
    const { store } = this.deps
    const cs = store.getChangeSets().find((c) => c.id === changeSetId)
    if (!cs || cs.reverted || cs.superseded) return
    store.db.transaction(() => {
      store.deleteSessions(cs.after.map((s) => s.id))
      store.upsertSessions(cs.before)
      store.upsertChangeSet({ ...cs, reverted: true })
    })()
    this.deps.onChange()
  }

  // ── internals ─────────────────────────────────────────

  private request(task: PlannerTask, raceOverride?: Race): PlannerRequest {
    const { store } = this.deps
    const today = todayISO()
    const runs = store.getRunsSince(addDays(today, -56))
    return {
      task,
      today,
      planStart: task === 'build_plan' ? mondayOf(today) : undefined,
      profile: store.getProfile(),
      race: raceOverride ?? store.getActiveRace(),
      settings: store.getSettings(),
      plan: task === 'build_plan' ? { weeks: [], sessions: [] } : { weeks: store.getWeeks(), sessions: store.getSessions() },
      recentRuns: runs,
      benchmarkRun: store.getRuns().find((r) => r.isBenchmark) ?? null,
      forecast: store.getForecast(today),
      revertedChangeSets: store.getChangeSets().filter((c) => c.reverted && c.kind === 'weather')
    }
  }

  private call(req: PlannerRequest, logName: string, extra?: Record<string, unknown>): Promise<PlannerResponse> {
    return callClaude<PlannerResponse>({
      systemPrompt: loadSkill(this.deps.skillFile),
      input: JSON.stringify(extra ? { ...req, ...extra } : req),
      schema: responseSchema(req.task),
      readDirs: req.imagePaths?.length ? [...new Set(req.imagePaths.map((p) => dirname(p)))] : undefined,
      logDir: this.deps.workDir,
      logName,
      // Predictions and screenshot reading are quick lookups; planning needs more thought.
      effort: req.task === 'predict' || req.task === 'parse_screenshot' ? 'low' : 'medium'
    })
  }

  private async runTask(task: 'build_plan' | 'refresh', trigger?: RefreshTrigger[]): Promise<void> {
    const { store } = this.deps
    await this.deps.prepare?.().catch(() => undefined)
    const req: PlannerRequest = { ...this.request(task), trigger }
    const race = req.race
    if (!race) throw new Error('Set up a race first.')

    // A session already logged today stays as it is; the plan is replaced after it.
    const todaysDone = store.getSessions().find((s) => s.date === req.today && s.status === 'done')
    const replaceFrom = todaysDone ? addDays(req.today, 1) : req.today

    let res = await this.call(req, task)
    let problems = res.sessions ? this.check(res, race, replaceFrom) : []
    if (problems.length) {
      // One retry, telling the planner exactly what was wrong.
      res = await this.call(req, `${task}.retry`, { previousAttemptProblems: problems })
      problems = res.sessions ? this.check(res, race, replaceFrom) : []
      if (problems.length) throw new Error(`The new plan broke a training rule: ${problems[0]}`)
    }

    const now = new Date().toISOString()
    store.db.transaction(() => {
      if (res.prediction) {
        const p: Prediction = { computedAt: now, times: res.prediction, raceDistanceSeconds: raceSecondsFrom(res.prediction, race.distanceKm) }
        store.addPrediction(p)
      }
      if (res.goalOptions) store.setGoalOptions(res.goalOptions)
      if (res.weeks) store.setWeeks(res.weeks)
      if (res.sessions) this.applySessions(res, replaceFrom, task, now)
      if (task === 'build_plan' && race.goalSeconds === 0 && res.goalOptions) {
        store.setActiveRace({ ...race, goalSeconds: res.goalOptions.realistic })
      }
    })()
    this.deps.afterRefresh?.()
  }

  private check(res: PlannerResponse, race: Race, replaceFrom: string): string[] {
    const { store } = this.deps
    const sessions = res.sessions!.filter((s) => s.date >= replaceFrom)
    return validatePlan({
      today: replaceFrom,
      race,
      sessions,
      weeks: res.weeks ?? store.getWeeks(),
      history: store.getSessions().filter((s) => s.date < replaceFrom)
    })
  }

  /** Replaces future sessions and records a change set for each reason the planner gave. */
  private applySessions(res: PlannerResponse, replaceFrom: string, task: PlannerTask, now: string): void {
    const { store } = this.deps
    const current = store.getSessions().filter((s) => s.date >= replaceFrom)
    const byId = new Map(current.map((s) => [s.id, s]))
    const next: Session[] = res.sessions!
      .filter((s) => s.date >= replaceFrom)
      .map((s: PlannedSession) => {
        const prior = s.id ? byId.get(s.id) : undefined
        return { ...s, id: prior?.id ?? randomUUID(), status: prior?.status ?? 'planned' }
      })

    const changes = res.changes ?? []
    for (const ch of changes) {
      const whole = task === 'build_plan'
      const dates = new Set(ch.dates)
      const cs: ChangeSet = {
        id: randomUUID(),
        createdAt: now,
        kind: ch.kind,
        reason: ch.reason,
        before: whole ? current : current.filter((s) => dates.has(s.date)),
        after: whole ? next : next.filter((s) => dates.has(s.date) || (s.movedFrom && dates.has(s.movedFrom))),
        reverted: false
      }
      store.upsertChangeSet(cs)
    }
    store.replaceSessionsFrom(replaceFrom, next)
    this.supersedeStale()
  }

  /** Earlier changes whose sessions a re-plan has since replaced can't be undone any more. */
  private supersedeStale(): void {
    const { store } = this.deps
    const live = new Map(store.getSessions().map((s) => [s.id, s]))
    for (const cs of store.getChangeSets()) {
      if (cs.reverted || cs.superseded) continue
      const intact = cs.after.every((s) => {
        const now = live.get(s.id)
        return now && now.date === s.date && now.type === s.type && now.distanceKm === s.distanceKm
      })
      if (!intact) store.upsertChangeSet({ ...cs, superseded: true })
    }
  }
}
