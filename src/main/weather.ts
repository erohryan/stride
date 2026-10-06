import { conditionFor } from '@shared/weather'
import type { Forecast, Location } from '@shared/types'

interface OpenMeteo {
  hourly: {
    time: string[]
    temperature_2m: number[]
    apparent_temperature: number[]
    wind_speed_10m: number[]
    wind_direction_10m: number[]
    precipitation_probability: (number | null)[]
    weather_code: number[]
  }
}

/** The next 7 days, hourly, in the location's local time. Open-Meteo needs no key. */
export async function fetchForecast(loc: Location): Promise<Forecast[]> {
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lon),
    hourly: 'temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code',
    forecast_days: '7',
    timezone: 'auto'
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Forecast unavailable (${res.status})`)
  const { hourly: h } = (await res.json()) as OpenMeteo

  const days = new Map<string, Forecast>()
  h.time.forEach((time, i) => {
    const date = time.slice(0, 10)
    if (!days.has(date)) days.set(date, { date, hourly: [] })
    days.get(date)!.hourly.push({
      time,
      tempC: round1(h.temperature_2m[i]),
      feelsC: round1(h.apparent_temperature[i]),
      windKph: Math.round(h.wind_speed_10m[i]),
      windDir: h.wind_direction_10m[i],
      precipPct: h.precipitation_probability[i] ?? 0,
      condition: conditionFor(h.weather_code[i])
    })
  })
  return [...days.values()]
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** A fingerprint of the conditions that matter for planning, to tell whether a new forecast changes anything. */
export function adverseSignature(days: Forecast[]): string {
  return days
    .map((d) => {
      const run = d.hourly.filter((x) => {
        const hr = Number(x.time.slice(11, 13))
        return (hr >= 6 && hr <= 9) || (hr >= 17 && hr <= 19)
      })
      const hot = run.some((x) => (x.feelsC ?? x.tempC) >= 30)
      const windy = run.some((x) => x.windKph > 35)
      const wet = run.some((x) => x.precipPct >= 70 && /Rain|Showers|Storm/.test(x.condition))
      return hot || windy || wet ? `${d.date}:${hot ? 'H' : ''}${windy ? 'W' : ''}${wet ? 'R' : ''}` : ''
    })
    .filter(Boolean)
    .join('|')
}
