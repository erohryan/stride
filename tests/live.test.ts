// Calls the real planner through the claude CLI. Run with: STRIDE_LIVE=1 npx vitest run tests/live.test.ts
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { callClaude, loadSkill } from '../src/main/claude'
import { mondayOf, responseSchema, validatePlan, type PlannerRequest, type PlannerResponse } from '@shared/planner'
import { DEFAULT_SETTINGS, type Race } from '@shared/types'

const race: Race = {
  id: 'vh',
  name: 'Victor Harbour Half Marathon',
  date: '2026-12-06',
  distanceKm: 21.0975,
  goalSeconds: 6300,
  location: { name: 'Victor Harbor, SA', lat: -35.55, lon: 138.62 }
}
const today = '2026-10-06'
const request = (task: PlannerRequest['task']): PlannerRequest => ({
  task,
  today,
  planStart: task === 'build_plan' ? mondayOf(today) : undefined,
  profile: {
    name: 'Sam',
    weeklyKm: 30,
    longestRecentKm: 14,
    recentRace: { distanceKm: 10, durationSec: 2830, date: '2026-09-27' },
    location: race.location,
    age: 34,
    maxHr: null
  },
  race,
  settings: DEFAULT_SETTINGS,
  plan: { weeks: [], sessions: [] },
  recentRuns: [],
  benchmarkRun: null,
  forecast: [],
  revertedChangeSets: []
})

const call = (req: PlannerRequest): Promise<PlannerResponse> =>
  callClaude<PlannerResponse>({
    systemPrompt: loadSkill(resolve(__dirname, '../skills/stride-planner/SKILL.md')),
    input: JSON.stringify(req),
    schema: responseSchema(req.task),
    readDirs: req.imagePaths ? [resolve(__dirname, 'fixtures')] : undefined,
    logDir: resolve(__dirname, '../out/live'),
    logName: req.task,
    effort: (process.env.STRIDE_EFFORT as 'low' | 'medium' | 'high') ?? 'medium'
  })

describe.skipIf(!process.env.STRIDE_LIVE)('planner skill (live)', () => {
  it('predicts sensible times', async () => {
    const res = await call(request('predict'))
    console.log(res.prediction, res.goalOptions)
    expect(res.prediction!.half).toBeGreaterThan(5400)
    expect(res.prediction!.half).toBeLessThan(7800)
    expect(res.goalOptions!.stretch).toBeLessThan(res.goalOptions!.comfortable)
  })

  it('builds a plan that follows the training rules', async () => {
    const t0 = Date.now()
    const res = await call(request('build_plan'))
    console.log(`build_plan took ${Math.round((Date.now() - t0) / 1000)}s`)
    console.log(res.weeks!.map((w) => `W${w.index} ${w.phase} ${w.plannedKm}km`).join(' | '))
    console.log(res.changes)
    const problems = validatePlan({ today, race, sessions: res.sessions!, weeks: res.weeks! })
    console.log(problems)
    expect(problems).toEqual([])
  })

  it('reads screenshots and groups them by run', async () => {
    const fx = (n: string): string => resolve(__dirname, 'fixtures', n)
    const t0 = Date.now()
    const res = await call({ ...request('parse_screenshot'), imagePaths: [fx('strava-summary.png'), fx('garmin.png'), fx('strava-splits.png')] })
    console.log(`parse took ${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(res.parsedRuns, null, 1))
    const runs = res.parsedRuns!
    expect(runs).toHaveLength(2)
    const strava = runs.find((r) => r.imageIndexes.includes(0))!
    expect(strava.imageIndexes.sort()).toEqual([0, 2])
    expect(strava.date).toBe('2026-10-05') // "Yesterday"
    expect(strava.distanceKm).toBeCloseTo(8.21, 2)
    expect(strava.durationSec).toBe(2818) // moving time, not elapsed
    expect(strava.avgHr).toBe(148)
    expect(strava.elevationM).toBe(38)
    expect(strava.splits).toHaveLength(8) // partial 0.21 km dropped
    expect(strava.splits![0]).toBe(352)
    const garmin = runs.find((r) => r.imageIndexes.includes(1))!
    expect(garmin.date).toBe('2026-10-04')
    expect(garmin.distanceKm).toBeCloseTo(15.02, 1) // 9.33 mi
    expect(garmin.durationSec).toBe(5050)
    expect(garmin.unreadable).toContain('elevationM')
  })
})
