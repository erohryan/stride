import { Notification, powerMonitor } from 'electron'
import { todayISO } from '@shared/dates'
import { formatDistanceWithUnit } from '@shared/format'
import { sessionDayName, unloggedSessions } from '@shared/plan-view'
import type { Session } from '@shared/types'
import type { Store } from './db'

const CHECK_EVERY_MS = 10 * 60_000
const KV_KEY = 'remindedSessionIds'

/**
 * The morning after a planned run, if nothing was logged for it, Stride sends one
 * notification. Clicking it opens Log a run for that session.
 */
export class Reminders {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private store: Store,
    private openLog: (session: Session | null) => void,
    /** Called after every check, so the tray's "to log" count stays current across midnight. */
    private onTick: () => void
  ) {}

  start(): void {
    const tick = (): void => {
      this.check()
      this.onTick()
    }
    setTimeout(tick, 10_000)
    this.timer = setInterval(tick, CHECK_EVERY_MS)
    powerMonitor.on('resume', () => setTimeout(tick, 5_000))
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** Sessions waiting to be logged, newest first, for the tray menu. */
  pending(): Session[] {
    return unloggedSessions(this.store.getSessions(), this.store.getRuns(), todayISO()).reverse()
  }

  check(now = new Date()): void {
    const { reminders, units } = this.store.getSettings()
    if (!reminders.enabled || now.getHours() < reminders.hour || !Notification.isSupported()) return
    const already = new Set(this.store.getKv<string[]>(KV_KEY) ?? [])
    const due = this.pending().filter((s) => !already.has(s.id))
    if (due.length === 0) return

    const today = todayISO()
    const first = due[0]
    const n =
      due.length === 1
        ? new Notification({
            title: `Log ${sessionDayName(first, today)}?`,
            body: `${formatDistanceWithUnit(first.distanceKm, units)} was planned. Drop in a screenshot and Stride does the rest.`
          })
        : new Notification({
            title: `${due.length} runs to log`,
            body: `${due.map((s) => sessionDayName(s, today)).join(', ')}. Add them so the plan stays on track.`
          })
    n.on('click', () => this.openLog(due.length === 1 ? first : null))
    n.show()

    // Forget sessions a re-plan has since removed, so the list stays short.
    const exists = new Set(this.store.getSessions().map((s) => s.id))
    this.store.setKv(KV_KEY, [...already, ...due.map((s) => s.id)].filter((id) => exists.has(id)))
  }
}
