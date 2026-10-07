import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/db'
import { CalendarFeed, planCsv } from '../src/main/export'
import { todayISO, addDays } from '@shared/dates'

function seeded(): Store {
  const store = new Store(':memory:')
  const d = (n: number): string => addDays(todayISO(), n)
  store.setActiveRace({ id: 'r', name: 'Victor Harbour Half, by the sea', date: d(10), distanceKm: 21.0975, goalSeconds: 6300, location: null })
  store.setWeeks([{ index: 1, startDate: addDays(todayISO(), -1), phase: 'base', plannedKm: 30 }])
  store.upsertSessions([
    { id: 'a', date: d(1), type: 'tempo', distanceKm: 10, targetPaceSecPerKm: 290, structure: [{ label: 'main', distanceKm: 6, paceSecPerKm: 290 }], status: 'planned', notes: 'Go early, it’s "hot"' },
    { id: 'b', date: d(10), type: 'race', distanceKm: 21.0975, targetPaceSecPerKm: 298, structure: [], status: 'planned' }
  ])
  return store
}

describe('exports', () => {
  it('builds a valid, folded iCalendar feed', () => {
    const ics = new CalendarFeed(seeded()).ics()
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(ics).toContain('SUMMARY:Tempo · 10 km')
    expect(ics).toContain('SUMMARY:Race day: Victor Harbour Half\\, by the sea')
    expect(ics).toContain('UID:a@stride')
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75)
  })

  it('writes the plan as CSV with quoting', () => {
    const csv = planCsv(seeded()).trim().split('\n')
    expect(csv[0]).toBe('Date,Week,Phase,Type,Distance (km),Target pace (/km),Structure,Status,Logged (km),Logged pace (/km),Score,Load,Notes')
    expect(csv[1]).toContain(',1,base,Tempo,10,4:50,Tempo 6 km @ 4:50,planned,,,,,"Go early, it’s ""hot"""')
  })

  it('marks logged runs with their score in the feed and the CSV', () => {
    const store = seeded()
    // 6 km of the 10 km tempo, in 30 min at effort 7.
    store.upsertRun({ id: 'x', date: addDays(todayISO(), 1), type: 'tempo', distanceKm: 6, durationSec: 1800, effort: 7, splits: [], source: 'screenshot', isBenchmark: false })
    const ics = new CalendarFeed(store).ics().replace(/\r\n /g, '')
    expect(ics).toMatch(/SUMMARY:✓ Tempo · 6 km · \d+\/100/)
    expect(ics).toContain('Logged: Off plan')
    expect(planCsv(store).split('\n')[1]).toMatch(/,6,5:00,\d+,210,/)
  })
})
