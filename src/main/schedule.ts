import { powerMonitor } from 'electron'
import { toISODate, todayISO } from '@shared/dates'
import type { Store } from './db'
import type { Planner } from './planner'
import { adverseSignature, fetchForecast } from './weather'

const SLOTS = [6, 18] // local hours for the planned refreshes
const FORECAST_MAX_AGE_MS = 3 * 60 * 60_000

/** Keeps the forecast fresh and runs the twice-daily weather check. */
export class Schedule {
  private timer: NodeJS.Timeout | null = null
  private fetchedAt = 0

  constructor(
    private store: Store,
    private planner: Planner,
    private onChange: () => void
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), 60_000)
    powerMonitor.on('resume', () => setTimeout(() => void this.tick(), 15_000))
    setTimeout(() => void this.tick(), 3_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** Fetches the forecast for the runner's home location. Quietly keeps the old one on failure. */
  async updateForecast(force = false): Promise<void> {
    const loc = this.store.getProfile()?.location
    // Dev aid: STRIDE_NO_WEATHER keeps a fixture forecast in place.
    if (!loc || process.env.STRIDE_NO_WEATHER) return
    if (!force && Date.now() - this.fetchedAt < FORECAST_MAX_AGE_MS) return
    try {
      const days = await fetchForecast(loc)
      this.store.setForecast(days, new Date().toISOString())
      this.fetchedAt = Date.now()
      this.onChange()
    } catch {
      // Offline or Open-Meteo down: the plan carries on with the last forecast.
    }
  }

  private async tick(): Promise<void> {
    await this.updateForecast()
    const due = latestSlot(new Date())
    const last = this.store.getKv<string>('lastScheduledSlot')
    if (last && last >= due) return
    this.store.setKv('lastScheduledSlot', due)
    await this.scheduledRefresh()
  }

  /**
   * Runs the planner only when the weather picture for run times has changed since the last
   * check, so quiet days cost nothing. Logged runs and settings changes refresh on their own.
   */
  private async scheduledRefresh(): Promise<void> {
    if (!this.store.getActiveRace() || this.store.getWeeks().length === 0) return
    await this.updateForecast(true)
    const previous = this.store.getKv<string>('weatherSignature') ?? ''
    if (this.signature() === previous) return
    // Shown through refresh.error on failure; the next slot tries again.
    await this.planner.refresh('scheduled').catch(() => undefined)
  }

  /** Called after any successful re-plan: the planner has seen the current weather. */
  markWeatherSeen(): void {
    this.store.setKv('weatherSignature', this.signature())
  }

  private signature(): string {
    return adverseSignature(this.store.getForecast(todayISO()).slice(0, 7))
  }
}

/** The most recent refresh slot at or before `now`, as a sortable local timestamp ("2026-10-06T06"). */
export function latestSlot(now: Date): string {
  const d = new Date(now)
  const hour = [...SLOTS].reverse().find((h) => h <= d.getHours())
  if (hour === undefined) {
    d.setDate(d.getDate() - 1)
    return `${toISODate(d)}T${String(SLOTS.at(-1)).padStart(2, '0')}`
  }
  return `${toISODate(d)}T${String(hour).padStart(2, '0')}`
}
