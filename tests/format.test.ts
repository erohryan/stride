import { describe, expect, it } from 'vitest'
import { formatDayDate, formatDistance, formatDuration, formatPace, formatTemp, parseDuration } from '@shared/format'

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(6300)).toBe('1:45:00')
    expect(formatDuration(2830)).toBe('47:10')
    expect(formatDuration(65)).toBe('1:05')
  })

  it('parses durations and rejects nonsense', () => {
    expect(parseDuration('1:45:00')).toBe(6300)
    expect(parseDuration('47:10')).toBe(2830)
    expect(parseDuration('45')).toBe(2700)
    expect(parseDuration('1:75')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
  })

  it('formats pace and distance in both units', () => {
    expect(formatPace(298, 'metric')).toBe('4:58 /km')
    expect(formatPace(298, 'imperial')).toBe('8:00 /mi')
    expect(formatDistance(21.0975, 'metric')).toBe('21.1')
    expect(formatDistance(8, 'metric')).toBe('8')
    expect(formatDistance(16.09344, 'imperial')).toBe('10')
    expect(formatTemp(19, 'imperial')).toBe('66°')
  })

  it('formats day dates', () => {
    expect(formatDayDate('2026-12-06')).toBe('Sun 6 Dec')
  })
})
