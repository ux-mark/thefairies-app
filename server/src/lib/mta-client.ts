// MTA real-time data client
// Uses MTA GTFS-RT feed for subway arrival predictions
// Open access, no API key needed

import axios from 'axios'
import GtfsRealtimeBindings from 'gtfs-realtime-bindings'

const FEED_URLS: Record<string, string> = {
  '123456S': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
  'ACE': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
  'BDFM': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
  'G': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',
  'JZ': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
  'NQRW': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
  'L': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l',
  'SIR': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si',
}

export interface SubwayArrival {
  routeId: string       // e.g. "1", "2", "3"
  direction: 'N' | 'S'  // Northbound (uptown) or Southbound (downtown)
  arrivalTime: number   // Unix timestamp
  minutesAway: number   // minutes until arrival
  stopId: string        // e.g. "120N"
}

async function fetchFeed(url: string) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 10000,
  })
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    new Uint8Array(response.data),
  )
}

export const mtaClient = {
  /**
   * Get upcoming arrivals for a station
   * @param stationId - Base stop ID (e.g. "120" for 103rd St on the 1 line)
   * @param direction - "N" (uptown), "S" (downtown), or "both"
   * @param feedGroup - Which feed to query (default: "123456S" for 1/2/3 lines)
   * @param maxMinutes - Only return arrivals within this many minutes (default: 30)
   */
  /**
   * @param stationId - Base stop ID (e.g. "120" for 103rd St)
   * @param direction - "N" (uptown), "S" (downtown), or "both"
   * @param feedGroup - Which feed to query (default: "123456S")
   * @param maxMinutes - Only return arrivals within this many minutes
   * @param routes - Optional: filter to only these route IDs (e.g. ["1"] for 103rd St which is 1-only)
   */
  async getArrivals(
    stationId: string = '120',
    direction: string = 'both',
    feedGroup: string = '123456S',
    maxMinutes: number = 30,
    routes?: string[],
  ): Promise<SubwayArrival[]> {
    const feedUrl = FEED_URLS[feedGroup]
    if (!feedUrl) throw new Error(`Unknown feed group: ${feedGroup}`)

    const feed = await fetchFeed(feedUrl)
    const now = Math.floor(Date.now() / 1000)
    const maxTime = now + maxMinutes * 60
    const arrivals: SubwayArrival[] = []

    for (const entity of feed.entity ?? []) {
      const tripUpdate = entity.tripUpdate
      if (!tripUpdate) continue

      const routeId = tripUpdate.trip?.routeId ?? ''

      // Filter by route if specified (e.g. only "1" for local-only stations)
      if (routes && routes.length > 0 && !routes.includes(routeId)) continue

      for (const stopTimeUpdate of tripUpdate.stopTimeUpdate ?? []) {
        const stopId = stopTimeUpdate.stopId ?? ''
        const baseStopId = stopId.replace(/[NS]$/, '')

        if (baseStopId !== stationId) continue

        const dir = stopId.endsWith('N') ? 'N' : stopId.endsWith('S') ? 'S' : null
        if (!dir) continue
        if (direction !== 'both' && dir !== direction) continue

        // arrival.time or departure.time can be a Long or number
        const rawArrival = stopTimeUpdate.arrival?.time ?? stopTimeUpdate.departure?.time
        const arrivalTime = typeof rawArrival === 'object' && rawArrival !== null
          ? Number(rawArrival)  // Long → number
          : Number(rawArrival ?? 0)

        if (arrivalTime <= now || arrivalTime > maxTime) continue

        arrivals.push({
          routeId,
          direction: dir,
          arrivalTime,
          minutesAway: Math.round((arrivalTime - now) / 60),
          stopId,
        })
      }
    }

    return arrivals.sort((a, b) => a.arrivalTime - b.arrivalTime)
  },

  /**
   * Check arrivals and return a status colour:
   * - green: train arriving in <= 3 minutes
   * - orange: train arriving in 4-7 minutes
   * - red: train arriving in 8+ minutes or no trains
   */
  async getStatus(
    stationId: string = '120',
    direction: string = 'S',
    routes?: string[],
  ): Promise<{
    status: 'green' | 'orange' | 'red'
    nextArrival: SubwayArrival | null
    arrivals: SubwayArrival[]
  }> {
    const arrivals = await this.getArrivals(stationId, direction, '123456S', 30, routes)
    const next = arrivals[0] ?? null

    let status: 'green' | 'orange' | 'red' = 'red'
    if (next) {
      if (next.minutesAway <= 3) status = 'green'
      else if (next.minutesAway <= 7) status = 'orange'
    }

    return { status, nextArrival: next, arrivals: arrivals.slice(0, 5) }
  },
}
