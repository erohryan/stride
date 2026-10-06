import type { Units } from './types'

export const KM_PER_MI = 1.609344

/** 6300 → "1:45:00", 2830 → "47:10". */
export function formatDuration(totalSec: number): string {
  const s = Math.round(totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/** Parses "1:45:00", "47:10" or "45" (minutes). Returns null when it isn't a time. */
export function parseDuration(text: string): number | null {
  const t = text.trim()
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null
  const parts = t.split(':').map(Number)
  if (parts.slice(1).some((p) => p >= 60)) return null
  if (parts.length === 1) return parts[0] * 60
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

/** Distance for display, without unit: 21.0975 → "21.1". Whole numbers drop the decimal. */
export function formatDistance(km: number, units: Units): string {
  const v = units === 'metric' ? km : km / KM_PER_MI
  const r = Math.round(v * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export const distanceUnit = (units: Units): string => (units === 'metric' ? 'km' : 'mi')

/** "8 km" / "5 mi". */
export function formatDistanceWithUnit(km: number, units: Units): string {
  return `${formatDistance(km, units)} ${distanceUnit(units)}`
}

/** Pace for display: 298 sec/km → "4:58 /km" (or per mile). */
export function formatPace(secPerKm: number, units: Units): string {
  const v = units === 'metric' ? secPerKm : secPerKm * KM_PER_MI
  const s = Math.round(v)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /${distanceUnit(units)}`
}

export function formatTemp(c: number, units: Units): string {
  return `${Math.round(units === 'metric' ? c : (c * 9) / 5 + 32)}°`
}

/** Converts a user-entered distance in display units back to km. */
export function toKm(value: number, units: Units): number {
  return units === 'metric' ? value : value * KM_PER_MI
}

export const RACE_DISTANCES: { id: string; label: string; km: number }[] = [
  { id: '5k', label: '5K', km: 5 },
  { id: '10k', label: '10K', km: 10 },
  { id: 'half', label: 'Half', km: 21.0975 },
  { id: 'marathon', label: 'Marathon', km: 42.195 }
]

/** "Half marathon", "10K", "30 km race" — used on the countdown chip. */
export function raceDistanceName(km: number, units: Units): string {
  if (Math.abs(km - 21.0975) < 0.05) return 'Half marathon'
  if (Math.abs(km - 42.195) < 0.05) return 'Marathon'
  if (Math.abs(km - 5) < 0.01) return '5K'
  if (Math.abs(km - 10) < 0.01) return '10K'
  return `${formatDistanceWithUnit(km, units)} race`
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const weekdayShort = (d: number): string => DAYS_SHORT[d]
export const weekdayLong = (d: number): string => DAYS_LONG[d]

/** "2026-12-06" → "Sun 6 Dec". */
export function formatDayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${DAYS_SHORT[date.getDay()]} ${d} ${MONTHS[m - 1]}`
}

/** The URL the renderer loads a stored screenshot from (served by the stride-shot protocol). */
export const shotUrl = (path: string): string => `stride-shot://${encodeURIComponent(path.split(/[\\/]/).pop()!)}`
