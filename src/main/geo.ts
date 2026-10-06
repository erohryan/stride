import type { Location } from '@shared/types'

interface GeoResult {
  name: string
  latitude: number
  longitude: number
  admin1?: string
  country_code?: string
}

/** Place search via Open-Meteo's free geocoding API. "Victor Harbor" → "Victor Harbor, SA". */
export async function searchPlaces(query: string): Promise<Location[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Place search failed (${res.status})`)
  const body = (await res.json()) as { results?: GeoResult[] }
  return (body.results ?? []).map((r) => ({
    name: [r.name, abbreviateRegion(r.admin1, r.country_code)].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude
  }))
}

const AU_STATES: Record<string, string> = {
  'South Australia': 'SA',
  'New South Wales': 'NSW',
  Victoria: 'VIC',
  Queensland: 'QLD',
  'Western Australia': 'WA',
  Tasmania: 'TAS',
  'Northern Territory': 'NT',
  'Australian Capital Territory': 'ACT'
}

function abbreviateRegion(admin1?: string, country?: string): string | undefined {
  if (!admin1) return country
  if (country === 'AU') return AU_STATES[admin1] ?? admin1
  return admin1
}
