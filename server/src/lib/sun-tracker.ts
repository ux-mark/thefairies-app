import SunCalc from 'suncalc'

export interface SunTimes {
  sunrise: string
  sunset: string
  solarNoon: string
  dawn: string
  dusk: string
  nauticalDawn: string
  nauticalDusk: string
  nightEnd: string
  night: string
  goldenHour: string
  goldenHourEnd: string
}

function getCoords(): { lat: number; lon: number } {
  const lat = Number(process.env.LATITUDE)
  const lon = Number(process.env.LONGITUDE)
  if (isNaN(lat) || isNaN(lon)) {
    throw new Error('Missing or invalid LATITUDE/LONGITUDE env vars')
  }
  return { lat, lon }
}

export function getSunTimes(date?: Date): SunTimes {
  const { lat, lon } = getCoords()
  const d = date ?? new Date()
  const times = SunCalc.getTimes(d, lat, lon)

  return {
    sunrise: times.sunrise.toISOString(),
    sunset: times.sunset.toISOString(),
    solarNoon: times.solarNoon.toISOString(),
    dawn: times.dawn.toISOString(),
    dusk: times.dusk.toISOString(),
    nauticalDawn: times.nauticalDawn.toISOString(),
    nauticalDusk: times.nauticalDusk.toISOString(),
    nightEnd: times.nightEnd.toISOString(),
    night: times.night.toISOString(),
    goldenHour: times.goldenHour.toISOString(),
    goldenHourEnd: times.goldenHourEnd.toISOString(),
  }
}

export type SunPhase =
  | 'night'
  | 'dawn'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'dusk'

export function getCurrentSunPhase(date?: Date): SunPhase {
  const { lat, lon } = getCoords()
  const d = date ?? new Date()
  const times = SunCalc.getTimes(d, lat, lon)
  const now = d.getTime()

  if (now < times.dawn.getTime()) return 'night'
  if (now < times.sunrise.getTime()) return 'dawn'
  if (now < times.solarNoon.getTime()) return 'morning'
  if (now < times.goldenHour.getTime()) return 'afternoon'
  if (now < times.sunset.getTime()) return 'evening'
  if (now < times.dusk.getTime()) return 'dusk'
  return 'night'
}
