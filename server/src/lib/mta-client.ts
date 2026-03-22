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
   * @param stationId - Base stop ID (e.g. "120" for 96th St on the 1/2/3 line)
   * @param direction - "N" (uptown), "S" (downtown), or "both"
   * @param feedGroup - Which feed to query (default: "123456S" for 1/2/3 lines)
   * @param maxMinutes - Only return arrivals within this many minutes (default: 30)
   * @param routes - Optional: filter to only these route IDs
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
   * Walk-time-aware status check.
   *
   * Logic:
   * - GREEN: buffer >= 3 min (comfortable, leave soon)
   * - ORANGE: buffer 1-2 min (tight, leave now)
   * - When the first train is missed (buffer < 1), find the best catchable train
   *   where platform wait <= maxWaitMinutes, and re-evaluate the status:
   *   - Catchable with buffer >= 3 -> GREEN
   *   - Catchable with buffer 1-2 -> ORANGE
   *   - No catchable within tolerance -> RED
   * - NONE: no upcoming trains
   *
   * @param maxWaitMinutes - max time the user is willing to wait on the platform (default 6)
   */
  async getStatus(
    stationId: string = '120',
    direction: string = 'S',
    routes?: string[],
    feedGroup: string = '123456S',
    walkTimeMinutes: number = 5,
    maxWaitMinutes: number = 6,
  ): Promise<{
    status: 'green' | 'orange' | 'red' | 'none'
    message: string
    nextArrival: SubwayArrival | null
    catchableTrain: SubwayArrival | null
    leaveInMinutes: number | null
    arrivals: SubwayArrival[]
  }> {
    const arrivals = await this.getArrivals(stationId, direction, feedGroup, 45, routes)
    const next = arrivals[0] ?? null

    if (!next) {
      return {
        status: 'none',
        message: 'No upcoming trains',
        nextArrival: null,
        catchableTrain: null,
        leaveInMinutes: null,
        arrivals: [],
      }
    }

    const buffer = next.minutesAway - walkTimeMinutes
    let status: 'green' | 'orange' | 'red' | 'none'
    let message: string
    let catchableTrain: SubwayArrival | null = null
    let leaveInMinutes: number | null = null
    const routeLabel = next.routeId

    if (buffer >= 3) {
      // Comfortable — leave soon
      status = 'green'
      catchableTrain = next
      leaveInMinutes = buffer - 2 // leave with ~2 min buffer
      message = `Leave soon \u2014 ${routeLabel} train in ${next.minutesAway} min (${walkTimeMinutes} min walk + ${buffer} min buffer)`
    } else if (buffer >= 1) {
      // Tight — leave now
      status = 'orange'
      catchableTrain = next
      leaveInMinutes = 0
      message = `Leave now! \u2014 ${routeLabel} train in ${next.minutesAway} min (${walkTimeMinutes} min walk \u2014 tight!)`
    } else {
      // Missed this train — find the best catchable one within platform wait tolerance
      // A train is "catchable" if buffer >= 1 (we arrive before it departs)
      // and we wouldn't wait on the platform longer than maxWaitMinutes
      const catchable = arrivals.find(a => {
        const b = a.minutesAway - walkTimeMinutes
        if (b < 1) return false // can't catch it
        return b <= maxWaitMinutes // platform wait within tolerance
      })

      if (catchable) {
        catchableTrain = catchable
        const catchableBuffer = catchable.minutesAway - walkTimeMinutes
        leaveInMinutes = Math.max(0, catchableBuffer - 2)

        // Re-evaluate status based on the catchable train's buffer
        if (catchableBuffer >= 3) {
          status = 'green'
          message = `Next ${catchable.routeId} train in ${catchable.minutesAway} min \u2014 leave in ${leaveInMinutes} min (${catchableBuffer} min wait at station)`
        } else {
          status = 'orange'
          message = `Leave now! \u2014 ${catchable.routeId} train in ${catchable.minutesAway} min (${catchableBuffer} min wait at station)`
        }
      } else {
        // No catchable train within platform wait tolerance
        status = 'red'
        const anyCatchable = arrivals.find(a => a.minutesAway - walkTimeMinutes >= 1)
        if (anyCatchable) {
          const platformWait = anyCatchable.minutesAway - walkTimeMinutes
          message = `Long wait \u2014 next ${anyCatchable.routeId} train in ${anyCatchable.minutesAway} min (${platformWait} min at station exceeds your ${maxWaitMinutes} min limit)`
        } else {
          message = `No catchable trains right now (next ${routeLabel} in ${next.minutesAway} min, need ${walkTimeMinutes} min walk)`
        }
      }
    }

    return {
      status,
      message,
      nextArrival: next,
      catchableTrain,
      leaveInMinutes,
      arrivals: arrivals.slice(0, 5),
    }
  },
}
