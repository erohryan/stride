import { describe, expect, it } from 'vitest'
import { loadDelta, runLoad, scoreRun, weekLoad } from '@shared/score'
import type { Run, Session } from '@shared/types'

const session = (type: Session['type'], km: number, pace: number, extra: Partial<Session> = {}): Session => ({
  id: 's',
  date: '2026-10-06',
  type,
  distanceKm: km,
  targetPaceSecPerKm: pace,
  structure: [],
  status: 'done',
  ...extra
})
const run = (type: Run['type'], km: number, sec: number, effort: number): Run => ({
  id: 'r',
  date: '2026-10-06',
  type,
  distanceKm: km,
  durationSec: sec,
  effort,
  splits: [],
  source: 'manual',
  isBenchmark: false
})

describe('scoreRun', () => {
  it('scores a run that matched the plan as spot on', () => {
    const s = scoreRun(run('easy', 8.1, 8.1 * 352, 3), session('easy', 8, 350))
    expect(s.total).toBe(100)
    expect(s.label).toBe('Spot on')
    expect(s.load.actual).toBe(Math.round(((8.1 * 352) / 60) * 3))
  })

  it('marks down an easy run pushed hard and long', () => {
    // 10 km at 5:00 /km and effort 7, planned 6 km easy at 6:00.
    const s = scoreRun(run('easy', 10, 3000, 7), session('easy', 6, 360))
    expect(s.distance!.score).toBe(0) // 67% over
    expect(s.pace!.diffSec).toBe(-60)
    expect(s.pace!.score).toBe(0) // 50 s beyond the fast edge
    expect(s.effort!.score).toBe(25)
    expect(s.label).toBe('Off plan')
    expect(s.load.ratio).toBeGreaterThan(2)
    expect(loadDelta(s.load.ratio)).toMatch(/^\+\d+% vs plan$/)
  })

  it('lets a steady run drift slower without much cost', () => {
    const s = scoreRun(run('long', 14, 14 * 400, 4), session('long', 14, 380))
    expect(s.pace!.score).toBe(100) // 20 s slow is inside the window
    expect(s.label).toBe('Spot on')
  })

  it('wants quality sessions on pace, judged on the whole session average', () => {
    const tempo = session('tempo', 10, 290, {
      structure: [
        { label: 'warmup', distanceKm: 2, paceSecPerKm: 360 },
        { label: 'main', distanceKm: 6, paceSecPerKm: 290 },
        { label: 'cooldown', distanceKm: 2, paceSecPerKm: 360 }
      ]
    })
    // Planned average: (720 + 1740 + 720) / 10 = 318 s/km. Ran it at 330: 12 s slow, inside the window.
    expect(scoreRun(run('tempo', 10, 3300, 7), tempo).pace!.score).toBe(100)
    // At 350 s/km: 32 s slow, 17 beyond the window, 2 points a second.
    expect(scoreRun(run('tempo', 10, 3500, 7), tempo).pace!.score).toBe(66)
  })

  it('treats a different session type as a partial miss', () => {
    expect(scoreRun(run('easy', 10, 3000, 7), session('tempo', 10, 300)).type!.matches).toBe(false)
    expect(scoreRun(run('recovery', 6, 2400, 2), session('easy', 6, 400)).type!.matches).toBe(true)
  })

  it('gives an unplanned run load but no score', () => {
    const s = scoreRun(run('easy', 5, 1800, 4), null)
    expect(s.total).toBeNull()
    expect(s.load.actual).toBe(120)
    expect(loadDelta(s.load.ratio)).toBe('unplanned')
  })

  it('sums a week of load against the plan', () => {
    const sessions = [session('easy', 8, 360), { ...session('long', 12, 380), id: 'l', date: '2026-10-11' }]
    const w = weekLoad('2026-10-05', sessions, [run('easy', 8, 2880, 3)])
    expect(w.actual).toBe(runLoad({ durationSec: 2880, effort: 3 }))
    expect(w.planned).toBe(Math.round(48 * 3) + Math.round(76 * 4))
  })
})
