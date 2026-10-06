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
})
