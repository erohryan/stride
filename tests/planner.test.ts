import { describe, expect, it } from 'vitest'
import { minPeakLongRunKm, mondayOf, validatePlan, type PlannedSession } from '@shared/planner'
import type { PlanWeek, Race } from '@shared/types'

const race: Race = { id: 'r', name: 'Test 10K', date: '2026-10-18', distanceKm: 10, goalSeconds: 2700, location: null }
const s = (date: string, type: PlannedSession['type'], km: number): PlannedSession => ({ date, type, distanceKm: km, structure: [] })
const weeks: PlanWeek[] = [
  { index: 1, startDate: '2026-10-05', phase: 'build', plannedKm: 30 },
  { index: 2, startDate: '2026-10-12', phase: 'taper', plannedKm: 25 }
]
// Tue 6 Oct → Sun 18 Oct
const good = [
  s('2026-10-06', 'easy', 8),
  s('2026-10-07', 'tempo', 8),
  s('2026-10-09', 'easy', 5),
  s('2026-10-11', 'long', 12),
  s('2026-10-13', 'intervals', 7),
  s('2026-10-15', 'easy', 5),
  s('2026-10-17', 'easy', 3),
  s('2026-10-18', 'race', 10)
]

describe('validatePlan', () => {
  it('accepts a plan that follows the rules', () => {
    expect(validatePlan({ today: '2026-10-06', race, sessions: good, weeks })).toEqual([])
  })

  it('rejects two hard days in a row', () => {
    const bad = good.map((x) => (x.date === '2026-10-06' ? s('2026-10-06', 'intervals', 8) : x))
    expect(validatePlan({ today: '2026-10-06', race, sessions: bad, weeks }).join()).toMatch(/two hard days/)
  })

  it('rejects a hard day right before the long run', () => {
    const bad = good.map((x) => (x.date === '2026-10-09' ? s('2026-10-10', 'tempo', 5) : x))
    expect(validatePlan({ today: '2026-10-06', race, sessions: bad, weeks }).join()).toMatch(/before a long run/)
  })

  it('checks hard days across the history boundary', () => {
    const history = [{ ...s('2026-10-05', 'tempo', 8), id: 'h', status: 'done' as const }]
    const bad = good.map((x) => (x.date === '2026-10-06' ? s('2026-10-06', 'intervals', 8) : x))
    expect(validatePlan({ today: '2026-10-06', race, sessions: bad.slice(0), weeks, history }).join()).toMatch(/2026-10-05 and 2026-10-06/)
  })

  it('requires the race on race day and weekly volume within 10%', () => {
    const noRace = good.filter((x) => x.type !== 'race')
    const out = validatePlan({ today: '2026-10-06', race, sessions: noRace, weeks }).join()
    expect(out).toMatch(/race day must hold/)
    expect(out).toMatch(/week 2: sessions add up to 15.0/)
  })

  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-10-06')).toBe('2026-10-05')
    expect(mondayOf('2026-10-11')).toBe('2026-10-05')
    expect(mondayOf('2026-10-05')).toBe('2026-10-05')
  })
})

describe('readiness', () => {
  const half: Race = { id: 'h', name: 'Half', date: '2026-12-06', distanceKm: 21.0975, goalSeconds: 6900, location: null }
  // Ryan's first plan: long runs 8 → 11 km on 3 days a week.
  const longs = ['2026-10-11:8', '2026-10-18:9', '2026-10-25:7', '2026-11-01:8', '2026-11-08:9', '2026-11-15:10', '2026-11-22:11', '2026-11-29:9']
  const thin = [...longs.map((x) => s(x.split(':')[0], 'long', Number(x.split(':')[1]))), s('2026-12-06', 'race', 21.0975)]

  it('rejects a half-marathon plan whose long run stalls at 11 km', () => {
    const out = validatePlan({ today: '2026-10-07', race: half, sessions: thin, weeks: [], readiness: { longestRecentKm: 12 } }).join(' | ')
    expect(out).toMatch(/longest long run is 11 km.*at least 16 km/)
    expect(out).toMatch(/below the runner's current longest run \(12 km\)/)
  })

  it('accepts one that starts at the current long run and builds to 18 km', () => {
    const good = [12, 13, 11, 14, 15, 13, 17, 18].map((km, i) => s(longs[i].split(':')[0], 'long', km))
    expect(validatePlan({ today: '2026-10-07', race: half, sessions: [...good, s('2026-12-06', 'race', 21.0975)], weeks: [], readiness: { longestRecentKm: 12 } })).toEqual([])
  })

  it('does not insist on a peak when the race is close', () => {
    expect(minPeakLongRunKm(21.0975, 4)).toBeNull()
    expect(minPeakLongRunKm(42.195, 10)).toBe(28)
    expect(minPeakLongRunKm(10, 8)).toBe(10)
  })
})
