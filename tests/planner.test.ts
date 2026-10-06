import { describe, expect, it } from 'vitest'
import { mondayOf, validatePlan, type PlannedSession } from '@shared/planner'
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
