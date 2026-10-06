// Turning hourly forecasts into the short phrases the screens show.
import { formatTemp } from './format'
import type { Forecast, HourlyForecast, ISODate, Units } from './types'

/** WMO weather codes (Open-Meteo) → a word or two. */
export function conditionFor(code: number): string {
  if (code === 0) return 'Sunny'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Cloudy'
  if (code <= 48) return 'Fog'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 86) return 'Snow showers'
  return 'Storm'
}

const hourOf = (h: HourlyForecast): number => Number(h.time.slice(11, 13))
const daylight = (f: Forecast): HourlyForecast[] => f.hourly.filter((h) => hourOf(h) >= 6 && hourOf(h) <= 19)

export function forecastFor(forecast: Forecast[], date: ISODate): Forecast | null {
  return forecast.find((f) => f.date === date) ?? null
}

/** "light breeze", "breezy", "windy", or nothing when calm. */
function windWords(kph: number): string | null {
  if (kph < 8) return null
  if (kph < 20) return 'light breeze'
  if (kph < 32) return 'breezy'
  return 'windy'
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const compass = (deg: number): string => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]

function mostCommon(xs: string[]): string {
  const counts = new Map<string, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

export interface DaySummary {
  /** "19° · Sunny, light breeze" — the Today chip. */
  long: string
  /** "19° Sunny", "35° Hot, go before 7 am", "17° SW wind 25 km/h" — day tiles. */
  short: string
  /** Hot, very windy or wet: shown in sky text. */
  adverse: boolean
}

export function summarizeDay(f: Forecast | null, units: Units): DaySummary | null {
  const hours = f ? daylight(f) : []
  if (hours.length === 0) return null
  const max = Math.max(...hours.map((h) => h.tempC))
  const wind = Math.max(...hours.map((h) => h.windKph))
  const rain = Math.max(...hours.map((h) => h.precipPct))
  const condition = mostCommon(hours.map((h) => h.condition))
  const temp = formatTemp(max, units)
  const windy = hours.reduce((a, h) => (h.windKph > a.windKph ? h : a))
  const speed = units === 'metric' ? `${Math.round(wind)} km/h` : `${Math.round(wind / 1.609344)} mph`

  const hot = max >= 30
  const gusty = wind >= 35
  const wet = rain >= 70 && /Rain|Showers|Storm|Drizzle/.test(condition)
  const words = windWords(wind)

  let short = `${temp} ${condition}`
  if (hot) {
    const w = bestWindow(f!)
    short = `${temp} Hot${w && w.endHour <= 9 ? `, go before ${w.endHour} am` : ''}`
  } else if (gusty || wind >= 22) short = `${temp} ${compass(windy.windDir)} wind ${speed}`
  else if (wet) short = `${temp} ${condition}, ${Math.round(rain)}% chance`

  return { long: `${temp} · ${condition}${words ? `, ${words}` : ''}`, short, adverse: hot || gusty || wet }
}

export interface RunWindow {
  startHour: number
  endHour: number
  label: string
}

/** The most comfortable two-hour morning window (5–10 am). */
export function bestWindow(f: Forecast): RunWindow | null {
  const morning = f.hourly.filter((h) => hourOf(h) >= 5 && hourOf(h) <= 10).sort((a, b) => hourOf(a) - hourOf(b))
  if (morning.length < 2) return null
  const score = (h: HourlyForecast): number => Math.max(0, h.tempC - 14) * 1.2 + Math.max(0, 6 - h.tempC) + h.windKph / 8 + h.precipPct / 15
  let best = 0
  for (let i = 1; i < morning.length - 1; i++) {
    if (score(morning[i]) + score(morning[i + 1]) < score(morning[best]) + score(morning[best + 1])) best = i
  }
  const a = morning[best]
  const b = morning[best + 1]
  const wind = windWords(Math.max(a.windKph, b.windKph))
  return {
    startHour: hourOf(a),
    endHour: hourOf(b) + 1,
    label: `Best window ${hourOf(a)}–${hourOf(b) + 1} am${wind ? `, ${wind}` : ', calm'}`
  }
}

/** Five hourly cells for the detail panel, from 6 am (or earlier when the best window starts earlier). */
export function morningCells(f: Forecast, units: Units): { label: string; temp: string; inWindow: boolean }[] {
  const w = bestWindow(f)
  const first = Math.min(6, w?.startHour ?? 6)
  return f.hourly
    .filter((h) => hourOf(h) >= first && hourOf(h) < first + 5)
    .sort((a, b) => hourOf(a) - hourOf(b))
    .map((h) => ({
      label: `${hourOf(h)} am`,
      temp: formatTemp(h.tempC, units),
      inWindow: !!w && hourOf(h) >= w.startHour && hourOf(h) < w.endHour
    }))
}
