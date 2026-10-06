import Database from 'better-sqlite3'
import type {
  AppState,
  ChangeSet,
  Forecast,
  GoalOptions,
  PlanWeek,
  Prediction,
  Profile,
  Race,
  Run,
  Session,
  Settings
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

// Rows keep their queryable keys as columns and everything else as JSON.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE race (id TEXT PRIMARY KEY, data TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE plan_week (idx INTEGER PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE session (id TEXT PRIMARY KEY, date TEXT NOT NULL, data TEXT NOT NULL);
  CREATE INDEX session_date ON session(date);
  CREATE TABLE run (id TEXT PRIMARY KEY, date TEXT NOT NULL, data TEXT NOT NULL);
  CREATE INDEX run_date ON run(date);
  CREATE TABLE prediction (computed_at TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE change_set (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE forecast (date TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT NOT NULL);
  `
]

export class Store {
  readonly db: Database.Database

  constructor(file: string) {
    this.db = new Database(file)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    const version = this.db.pragma('user_version', { simple: true }) as number
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.db.transaction(() => {
        this.db.exec(MIGRATIONS[v])
        this.db.pragma(`user_version = ${v + 1}`)
      })()
    }
  }

  // ── kv ────────────────────────────────────────────────
  getKv<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : null
  }

  setKv(key: string, value: unknown): void {
    this.db
      .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value))
  }

  getProfile(): Profile | null {
    return this.getKv<Profile>('profile')
  }
  setProfile(p: Profile): void {
    this.setKv('profile', p)
  }

  getSettings(): Settings {
    return { ...DEFAULT_SETTINGS, ...this.getKv<Settings>('settings') }
  }
  setSettings(s: Settings): void {
    this.setKv('settings', s)
  }

  getGoalOptions(): GoalOptions | null {
    return this.getKv<GoalOptions>('goalOptions')
  }
  setGoalOptions(g: GoalOptions | null): void {
    this.setKv('goalOptions', g)
  }

  // ── race ──────────────────────────────────────────────
  getActiveRace(): Race | null {
    const row = this.db.prepare('SELECT data FROM race WHERE active = 1 LIMIT 1').get() as { data: string } | undefined
    return row ? (JSON.parse(row.data) as Race) : null
  }

  /** Saves a race and makes it the only active one. */
  setActiveRace(r: Race): void {
    this.db.transaction(() => {
      this.db.prepare('UPDATE race SET active = 0').run()
      this.db
        .prepare('INSERT INTO race (id, data, active) VALUES (?, ?, 1) ON CONFLICT(id) DO UPDATE SET data = excluded.data, active = 1')
        .run(r.id, JSON.stringify(r))
    })()
  }

  // ── plan ──────────────────────────────────────────────
  getWeeks(): PlanWeek[] {
    return this.rows<PlanWeek>('SELECT data FROM plan_week ORDER BY idx')
  }

  setWeeks(weeks: PlanWeek[]): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM plan_week').run()
      const ins = this.db.prepare('INSERT INTO plan_week (idx, data) VALUES (?, ?)')
      for (const w of weeks) ins.run(w.index, JSON.stringify(w))
    })()
  }

  getSessions(): Session[] {
    return this.rows<Session>('SELECT data FROM session ORDER BY date')
  }

  /** Replaces every session on or after `fromDate`; earlier sessions are history and stay put. */
  replaceSessionsFrom(fromDate: string, sessions: Session[]): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM session WHERE date >= ?').run(fromDate)
      this.upsertSessionsInner(sessions)
    })()
  }

  upsertSessions(sessions: Session[]): void {
    this.db.transaction(() => this.upsertSessionsInner(sessions))()
  }

  deleteSessions(ids: string[]): void {
    const del = this.db.prepare('DELETE FROM session WHERE id = ?')
    this.db.transaction(() => ids.forEach((id) => del.run(id)))()
  }

  private upsertSessionsInner(sessions: Session[]): void {
    const up = this.db.prepare(
      'INSERT INTO session (id, date, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET date = excluded.date, data = excluded.data'
    )
    for (const s of sessions) up.run(s.id, s.date, JSON.stringify(s))
  }

  // ── runs ──────────────────────────────────────────────
  getRuns(): Run[] {
    return this.rows<Run>('SELECT data FROM run ORDER BY date DESC')
  }

  getRunsSince(date: string): Run[] {
    return this.rows<Run>('SELECT data FROM run WHERE date >= ? ORDER BY date DESC', date)
  }

  upsertRun(r: Run): void {
    this.db
      .prepare('INSERT INTO run (id, date, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET date = excluded.date, data = excluded.data')
      .run(r.id, r.date, JSON.stringify(r))
  }

  deleteRun(id: string): void {
    this.db.prepare('DELETE FROM run WHERE id = ?').run(id)
  }

  /** A new race starts a new plan: drop the old plan's weeks, its future sessions and its predictions. */
  resetPlanFrom(date: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM plan_week').run()
      this.db.prepare('DELETE FROM session WHERE date >= ?').run(date)
      this.db.prepare('DELETE FROM prediction').run()
      this.setKv('goalOptions', null)
    })()
  }

  // ── predictions ───────────────────────────────────────
  addPrediction(p: Prediction): void {
    this.db.prepare('INSERT OR REPLACE INTO prediction (computed_at, data) VALUES (?, ?)').run(p.computedAt, JSON.stringify(p))
  }

  getPredictions(): Prediction[] {
    return this.rows<Prediction>('SELECT data FROM prediction ORDER BY computed_at')
  }

  // ── change sets ───────────────────────────────────────
  getChangeSets(): ChangeSet[] {
    return this.rows<ChangeSet>('SELECT data FROM change_set ORDER BY created_at DESC')
  }

  upsertChangeSet(c: ChangeSet): void {
    this.db
      .prepare('INSERT INTO change_set (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(c.id, c.createdAt, JSON.stringify(c))
  }

  // ── forecast ──────────────────────────────────────────
  getForecast(fromDate: string): Forecast[] {
    return this.rows<Forecast>('SELECT data FROM forecast WHERE date >= ? ORDER BY date', fromDate)
  }

  setForecast(days: Forecast[], fetchedAt: string): void {
    const up = this.db.prepare(
      'INSERT INTO forecast (date, data, fetched_at) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at'
    )
    this.db.transaction(() => days.forEach((d) => up.run(d.date, JSON.stringify(d), fetchedAt)))()
  }

  // ── snapshot ──────────────────────────────────────────
  snapshot(today: string): Omit<AppState, 'refresh' | 'calendar' | 'openAtLogin'> {
    const predictionHistory = this.getPredictions()
    return {
      profile: this.getProfile(),
      settings: this.getSettings(),
      race: this.getActiveRace(),
      weeks: this.getWeeks(),
      sessions: this.getSessions(),
      runs: this.getRuns(),
      prediction: predictionHistory.at(-1) ?? null,
      predictionHistory,
      goalOptions: this.getGoalOptions(),
      changeSets: this.getChangeSets(),
      forecast: this.getForecast(today)
    }
  }

  private rows<T>(sql: string, ...params: unknown[]): T[] {
    return (this.db.prepare(sql).all(...params) as { data: string }[]).map((r) => JSON.parse(r.data) as T)
  }
}
