import type { Run } from '@shared/types'
import type { Store } from './db'
import type { Planner } from './planner'
import type { Screenshots } from './screenshots'

/** Logging runs, and keeping the plan's sessions in step with them. */
export class Runs {
  constructor(
    private store: Store,
    private planner: Planner,
    private shots: Screenshots,
    private onChange: () => void
  ) {}

  save(run: Run): void {
    const { store } = this
    const previous = store.getRuns().find((r) => r.id === run.id)
    store.db.transaction(() => {
      if (run.isBenchmark) for (const r of store.getRuns()) if (r.isBenchmark && r.id !== run.id) store.upsertRun({ ...r, isBenchmark: false })
      store.upsertRun(run)
      this.syncSession(run.date)
      if (previous && previous.date !== run.date) this.syncSession(previous.date)
    })()
    // Screenshots dropped from an edit are no longer needed.
    if (previous?.screenshotPaths) void this.shots.remove(previous.screenshotPaths.filter((p) => !run.screenshotPaths?.includes(p)))
    this.onChange()
    void this.planner.refresh(run.isBenchmark && !previous?.isBenchmark ? 'benchmark_changed' : 'run_logged').catch(() => undefined)
  }

  delete(id: string): void {
    const run = this.store.getRuns().find((r) => r.id === id)
    if (!run) return
    this.store.db.transaction(() => {
      this.store.deleteRun(id)
      this.syncSession(run.date)
    })()
    void this.shots.remove(run.screenshotPaths ?? [])
    this.onChange()
    void this.planner.refresh('run_deleted').catch(() => undefined)
  }

  /** "I didn't do this one": stops reminders and tells the planner. */
  skip(sessionId: string): void {
    const s = this.store.getSessions().find((x) => x.id === sessionId)
    if (!s) return
    this.store.upsertSessions([{ ...s, status: 'skipped' }])
    this.onChange()
  }

  setBenchmark(runId: string | null): void {
    const { store } = this
    store.db.transaction(() => {
      for (const r of store.getRuns()) {
        const want = r.id === runId
        if (r.isBenchmark !== want) store.upsertRun({ ...r, isBenchmark: want })
      }
    })()
    this.onChange()
    void this.planner.refresh('benchmark_changed').catch(() => undefined)
  }

  saveGoal(goalSeconds: number): Promise<void> {
    const race = this.store.getActiveRace()
    if (!race) return Promise.resolve()
    this.store.setActiveRace({ ...race, goalSeconds })
    this.onChange()
    return this.planner.refresh('goal_changed')
  }

  /** A planned session is done when any run lands on its day. */
  private syncSession(date: string): void {
    const s = this.store.getSessions().find((x) => x.date === date && x.type !== 'rest')
    if (!s) return
    const ran = this.store.getRuns().some((r) => r.date === date)
    const status = ran ? 'done' : s.status === 'done' ? 'planned' : s.status
    if (status !== s.status) this.store.upsertSessions([{ ...s, status }])
  }
}
