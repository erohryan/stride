import { createServer, type Server } from 'http'
import { addDays, todayISO } from '@shared/dates'
import { formatDistanceWithUnit, formatPace } from '@shared/format'
import { sessionTitle, structureRows } from '@shared/plan-view'
import type { Session, Units } from '@shared/types'
import type { Store } from './db'

// ── Calendar feed ──────────────────────────────────────

const PREFERRED_PORT = 48761

/**
 * Serves the plan as an iCalendar feed on 127.0.0.1. Calendar subscribes to it (webcal://),
 * so events move when the plan does, as long as Stride is running.
 */
export class CalendarFeed {
  private server: Server | null = null
  port = 0

  constructor(private store: Store) {}

  async start(): Promise<void> {
    const saved = this.store.getKv<number>('calendarPort') ?? PREFERRED_PORT
    for (const port of [saved, PREFERRED_PORT, PREFERRED_PORT + 1, PREFERRED_PORT + 2, PREFERRED_PORT + 3]) {
      if (await this.listen(port)) {
        this.port = port
        this.store.setKv('calendarPort', port)
        return
      }
    }
  }

  stop(): void {
    this.server?.close()
  }

  get url(): string {
    return `webcal://127.0.0.1:${this.port}/stride.ics`
  }

  private listen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        if (req.url?.split('?')[0] !== '/stride.ics') {
          res.writeHead(404).end()
          return
        }
        this.store.setKv('calendarFetchedAt', new Date().toISOString())
        res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' })
        res.end(this.ics())
      })
      server.once('error', () => resolve(false))
      server.listen(port, '127.0.0.1', () => {
        this.server = server
        resolve(true)
      })
    })
  }

  ics(): string {
    const { store } = this
    const units = store.getSettings().units
    const race = store.getActiveRace()
    const from = addDays(todayISO(), -14)
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Stride//Run planner//EN',
      'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:Stride',
      'X-WR-CALDESC:Your training plan',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H'
    ]
    for (const s of store.getSessions()) {
      if (s.type === 'rest' || s.date < from) continue
      const title = s.type === 'race' && race ? `Race day: ${race.name}` : `${sessionTitle(s.type)} · ${formatDistanceWithUnit(s.distanceKm, units)}`
      lines.push(
        'BEGIN:VEVENT',
        `UID:${s.id}@stride`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${s.date.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${addDays(s.date, 1).replace(/-/g, '')}`,
        `SUMMARY:${escape(title)}`,
        `DESCRIPTION:${escape(describe(s, units))}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT'
      )
    }
    lines.push('END:VCALENDAR')
    return lines.map(fold).join('\r\n') + '\r\n'
  }

  /** Events in the feed and whether Calendar has fetched it lately. */
  status(): { subscribed: boolean; runs: number } {
    const fetched = this.store.getKv<string>('calendarFetchedAt')
    const recent = !!fetched && Date.now() - new Date(fetched).getTime() < 3 * 86_400_000
    const runs = this.store.getSessions().filter((s) => s.type !== 'rest' && s.date >= todayISO()).length
    return { subscribed: recent, runs }
  }
}

function describe(s: Session, units: Units): string {
  const rows = structureRows(s, units).map((r) => `${r.label}: ${r.detail}`)
  const pace = s.targetPaceSecPerKm ? `Target pace ${formatPace(s.targetPaceSecPerKm, units)}` : ''
  return [pace, ...rows, s.notes ?? ''].filter(Boolean).join('\n')
}

const escape = (t: string): string => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

/** RFC 5545: lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let start = 0
  while (start < bytes.length) {
    let end = Math.min(start + (parts.length ? 74 : 75), bytes.length)
    // Don't split a multi-byte character.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    parts.push(bytes.subarray(start, end).toString('utf8'))
    start = end
  }
  return parts.join('\r\n ')
}

// ── CSV ────────────────────────────────────────────────

export function planCsv(store: Store): string {
  const units = store.getSettings().units
  const unit = units === 'metric' ? 'km' : 'mi'
  const weeks = store.getWeeks()
  const weekOf = (date: string): (typeof weeks)[number] | undefined => [...weeks].reverse().find((w) => w.startDate <= date)
  const header = ['Date', 'Week', 'Phase', 'Type', `Distance (${unit})`, `Target pace (/${unit})`, 'Structure', 'Status', 'Notes']
  const rows = store
    .getSessions()
    .filter((s) => s.type !== 'rest')
    .map((s) => {
      const w = weekOf(s.date)
      return [
        s.date,
        w ? String(w.index) : '',
        w?.phase ?? '',
        sessionTitle(s.type),
        formatDistanceWithUnit(s.distanceKm, units).replace(/ (km|mi)$/, ''),
        s.targetPaceSecPerKm ? formatPace(s.targetPaceSecPerKm, units).replace(/ \/(km|mi)$/, '') : '',
        structureRows(s, units)
          .map((r) => `${r.label} ${r.detail}`)
          .join('; '),
        s.status,
        s.notes ?? ''
      ]
    })
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

const csvCell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
