import { describe, expect, it } from 'vitest'
import {
  activeWeatherChange,
  changeHeadline,
  countdown,
  predictionStatus,
  sessionSeconds,
  sessionSummary,
  structureRows,
  upcoming,
  weatherNoteTitle,
  weekIndexFor,
  weekRange
} from '@shared/plan-view'
import { bestWindow, summarizeDay } from '@shared/weather'
import type { ChangeSet, Forecast, PlanWeek, Session } from '@shared/types'

const sess = (date: string, type: Session['type'], km: number, extra: Partial<Session> = {}): Session => ({
  id: date,
  date,
  type,
  distanceKm: km,
  structure: [],
  status: 'planned',
  ...extra
})

const tempo = sess('2026-10-07', 'tempo', 10, {
  targetPaceSecPerKm: 290,
  structure: [
    { label: 'warmup', distanceKm: 2, paceSecPerKm: 360 },
    { label: 'main', distanceKm: 6, paceSecPerKm: 290 },
    { label: 'cooldown', distanceKm: 2, paceSecPerKm: 365 }
  ]
})
const intervals = sess('2026-09-30', 'intervals', 9, {
  targetPaceSecPerKm: 265,
  structure: [
    { label: 'warmup', distanceKm: 2 },
    { label: 'rep', distanceKm: 0.8, paceSecPerKm: 265, repeat: 6 },
    { label: 'recovery', distanceKm: 0.4, repeat: 6 },
    { label: 'cooldown', distanceKm: 1.8 }
  ]
})

describe('plan view', () => {
  it('summarises sessions like the mocks', () => {
    expect(sessionSummary(tempo, 'metric')).toBe('6 km @ 4:50')
    expect(sessionSummary(intervals, 'metric')).toBe('6 × 800 m')
    expect(sessionSummary(sess('2026-10-06', 'easy', 8, { targetPaceSecPerKm: 350 }), 'metric')).toBe('5:50 /km')
  })

  it('estimates duration from the structure', () => {
    expect(Math.round(sessionSeconds(tempo)! / 60)).toBe(53) // 12 + 29 + 12.2
    expect(Math.round(sessionSeconds(sess('d', 'easy', 8, { targetPaceSecPerKm: 350 }))! / 60)).toBe(47)
  })

  it('builds structure rows with the main set marked', () => {
    const rows = structureRows(tempo, 'metric')
    expect(rows.map((r) => [r.label, r.detail, r.main])).toEqual([
      ['Warm-up', '2 km @ 6:00', false],
      ['Tempo', '6 km @ 4:50', true],
      ['Cool-down', '2 km @ 6:05', false]
    ])
    expect(structureRows(intervals, 'metric')[1].detail).toBe('6 × 800 m @ 4:25')
  })

  it('formats week ranges and countdowns', () => {
    expect(weekRange('2026-10-05')).toBe('5 – 11 October')
    expect(weekRange('2026-09-28')).toBe('28 Sep – 4 Oct')
    const race = { id: 'r', name: 'x', date: '2026-12-06', distanceKm: 21.0975, goalSeconds: 6300, location: null }
    expect(countdown('2026-10-06', race)).toBe('61 days')
    expect(countdown('2026-12-06', race)).toBe('Race day')
  })

  it('finds the current week and what is coming up', () => {
    const weeks: PlanWeek[] = [
      { index: 1, startDate: '2026-09-14', phase: 'base', plannedKm: 30 },
      { index: 2, startDate: '2026-09-21', phase: 'base', plannedKm: 32 },
      { index: 3, startDate: '2026-09-28', phase: 'base', plannedKm: 28 },
      { index: 4, startDate: '2026-10-05', phase: 'base', plannedKm: 45 }
    ]
    expect(weekIndexFor(weeks, '2026-10-06')).toBe(3)
    expect(weekIndexFor(weeks, '2026-09-01')).toBe(0)
    const s = [sess('2026-10-06', 'easy', 8), tempo, sess('2026-10-08', 'easy', 6), sess('2026-10-10', 'recovery', 5), sess('2026-10-11', 'long', 16), sess('2026-10-13', 'easy', 6)]
    expect(upcoming(s, '2026-10-06').map((x) => x.date)).toEqual(['2026-10-07', '2026-10-08', '2026-10-10', '2026-10-11'])
  })

  it('says whether the prediction is on track', () => {
    const p = (sec: number) => ({ computedAt: '', times: { '5k': 0, '10k': 0, half: sec, marathon: 0 }, raceDistanceSeconds: sec })
    expect(predictionStatus(p(6290), 6300)).toBe('On track')
    expect(predictionStatus(p(6380), 6300)).toBe('1:20 behind goal')
    expect(predictionStatus(p(6100), 6300)).toBe('Ahead of goal')
  })

  it('describes weather changes', () => {
    const wed = { ...tempo }
    const thuBefore = { ...tempo, date: '2026-10-08' }
    const swap: ChangeSet = {
      id: 'c',
      createdAt: '2026-10-05T20:02:00.000Z',
      kind: 'weather',
      reason: 'Thursday is forecast to reach 35°.',
      before: [thuBefore, sess('2026-10-07', 'easy', 6)],
      after: [{ ...wed, movedFrom: '2026-10-08' }, sess('2026-10-08', 'easy', 6, { movedFrom: '2026-10-07' })],
      reverted: false
    }
    expect(changeHeadline(swap)).toBe('We swapped Wednesday and Thursday')
    expect(weatherNoteTitle(swap.reason)).toBe('Plan adjusted for the heat')
    expect(activeWeatherChange([swap], '2026-10-06')?.id).toBe('c')
    expect(activeWeatherChange([{ ...swap, reverted: true }], '2026-10-06')).toBeNull()
    expect(activeWeatherChange([swap], '2026-10-20')).toBeNull()
  })
})

const day = (temps: number[], wind = 10, condition = 'Sunny'): Forecast => ({
  date: '2026-10-08',
  hourly: temps.map((t, i) => ({ time: `2026-10-08T${String(i + 5).padStart(2, '0')}:00`, tempC: t, windKph: wind, windDir: 200, precipPct: 0, condition }))
})

describe('weather', () => {
  it('summarises a mild day', () => {
    const s = summarizeDay(day([12, 14, 16, 18, 19, 20, 21, 22, 22, 21, 20, 19, 18, 17, 16]), 'metric')!
    expect(s.long).toBe('22° · Sunny, light breeze')
    expect(s.adverse).toBe(false)
  })

  it('flags a hot day and suggests going early', () => {
    const s = summarizeDay(day([22, 24, 27, 30, 32, 34, 35, 35, 35, 34, 33, 31, 29, 27, 25]), 'metric')!
    expect(s.adverse).toBe(true)
    expect(s.short).toBe('35° Hot, go before 7 am')
  })

  it('finds the best morning window', () => {
    expect(bestWindow(day([15, 15, 17, 19, 21, 22]))!.label).toBe('Best window 5–7 am, light breeze')
  })
})

describe('unlogged sessions', () => {
  it('lists recent planned runs with nothing logged', async () => {
    const { unloggedSessions, sessionDayName } = await import('@shared/plan-view')
    const s = [
      sess('2026-09-20', 'easy', 5), // too old
      sess('2026-10-03', 'long', 12),
      sess('2026-10-04', 'easy', 5, { status: 'skipped' }),
      sess('2026-10-05', 'tempo', 8),
      sess('2026-10-06', 'easy', 6) // today: not due yet
    ]
    const runs = [{ id: 'r', date: '2026-10-05', type: 'tempo' as const, distanceKm: 8, durationSec: 2400, effort: 7, splits: [], source: 'manual' as const, isBenchmark: false }]
    const due = unloggedSessions(s, runs, '2026-10-06')
    expect(due.map((x) => x.date)).toEqual(['2026-10-03'])
    expect(sessionDayName(sess('2026-10-05', 'tempo', 8), '2026-10-06')).toBe("yesterday's tempo")
    expect(sessionDayName(due[0], '2026-10-06')).toBe("Saturday's long run")
  })
})

describe('superseded changes', () => {
  it('hides a weather change once a later re-plan replaced its sessions', async () => {
    const { activeWeatherChange } = await import('@shared/plan-view')
    const cs: ChangeSet = { id: 'c', createdAt: '', kind: 'weather', reason: 'heat', before: [], after: [sess('2026-10-07', 'tempo', 6)], reverted: false, superseded: true }
    expect(activeWeatherChange([cs], '2026-10-06')).toBeNull()
  })
})

describe('schedule slots', () => {
  it('finds the latest 6:00 or 18:00 slot', async () => {
    const { latestSlot } = await import('../src/main/schedule')
    expect(latestSlot(new Date(2026, 9, 6, 5, 59))).toBe('2026-10-05T18')
    expect(latestSlot(new Date(2026, 9, 6, 6, 0))).toBe('2026-10-06T06')
    expect(latestSlot(new Date(2026, 9, 6, 17, 30))).toBe('2026-10-06T06')
    expect(latestSlot(new Date(2026, 9, 6, 23, 0))).toBe('2026-10-06T18')
  })
})

describe('tray title', () => {
  it('shows today at a glance', async () => {
    const { trayTitle } = await import('@shared/plan-view')
    const s = [sess('2026-10-06', 'easy', 8)]
    expect(trayTitle(s, [], '2026-10-06', 19, 'metric')).toBe('8 km · 19°')
    expect(trayTitle(s, [], '2026-10-07', 19, 'metric')).toBe('Rest · 19°')
    expect(trayTitle(s, [], '2026-10-06', null, 'imperial')).toBe('5 mi')
    expect(trayTitle([], [], '2026-10-06', 19, 'metric')).toBe('')
  })
})
