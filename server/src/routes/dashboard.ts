import { Router, Request, Response } from 'express'
import { getAll, getOne, run, db } from '../db/index.js'
import { getCurrentWeather } from '../lib/weather-client.js'
import { getSunTimes, getCurrentSunPhase } from '../lib/sun-tracker.js'
import { sunModeScheduler } from '../lib/sun-mode-scheduler.js'
import { motionHandler } from '../lib/motion-handler.js'
import { getHistoryStats } from '../lib/history-collector.js'
import { computeInsights } from '../lib/insights-engine.js'

const router = Router()

interface CurrentStateRow {
  key: string
  value: string
}

interface RoomRow {
  name: string
  temperature: number | null
  lux: number | null
  current_scene: string | null
  last_active: string | null
  auto: number
}

interface BatteryDeviceRow {
  id: number
  label: string
  device_type: string
  battery: string | null
  updated_at: string
}

interface PowerDeviceRow {
  id: number
  label: string
  room_name: string | null
  power: string | null
  energy: string | null
  switch_state: string | null
}

// GET /summary — aggregate dashboard data in a single request
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    // Mode
    const modeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'mode'",
    )
    const allModesRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'all_modes'",
    )
    const mode = modeRow?.value || 'Morning'
    const allModes: string[] = allModesRow?.value
      ? JSON.parse(allModesRow.value)
      : []

    // Rooms with sensor data
    const rooms = getAll<RoomRow>(
      'SELECT name, temperature, lux, current_scene, last_active, auto FROM rooms ORDER BY display_order',
    )

    // Battery devices
    const batteryDevices = getAll<BatteryDeviceRow>(
      "SELECT id, label, device_type, json_extract(attributes, '$.battery') as battery, updated_at FROM hub_devices WHERE json_extract(attributes, '$.battery') IS NOT NULL",
    )
    const battery = batteryDevices
      .map((d) => {
        const level = d.battery !== null ? Number(d.battery) : null
        let status: 'ok' | 'low' | 'critical' = 'ok'
        if (level !== null && level < 5) status = 'critical'
        else if (level !== null && level < 15) status = 'low'
        return {
          id: d.id,
          label: d.label,
          device_type: d.device_type,
          battery: level,
          status,
          updated_at: d.updated_at,
        }
      })
      .sort((a, b) => (a.battery ?? 100) - (b.battery ?? 100))

    // Power-reporting devices
    const powerDevices = getAll<PowerDeviceRow>(
      `SELECT h.id, h.label,
              COALESCE(dr.room_name, h.room_name) as room_name,
              json_extract(h.attributes, '$.power') as power,
              json_extract(h.attributes, '$.energy') as energy,
              json_extract(h.attributes, '$.switch') as switch_state
       FROM hub_devices h
       LEFT JOIN device_rooms dr ON CAST(h.id AS TEXT) = dr.device_id
       WHERE json_extract(h.attributes, '$.power') IS NOT NULL`,
    )
    const power = powerDevices.map((d) => ({
      id: d.id,
      label: d.label,
      room_name: d.room_name,
      power: d.power !== null ? Number(d.power) : 0,
      energy: d.energy !== null ? Number(d.energy) : null,
      switch: (d.switch_state as 'on' | 'off') || 'off',
    }))

    // Sun schedule and phase
    let sunSchedule: unknown[] = []
    let sunPhase = ''
    let sunTimes: unknown = {}
    try {
      sunSchedule = sunModeScheduler.getSchedule()
      sunPhase = getCurrentSunPhase()
      sunTimes = getSunTimes()
    } catch {
      // Sun calculations may fail without lat/lon
    }

    // Weather (cached, won't make extra API call)
    let weather: unknown = null
    try {
      weather = await getCurrentWeather()
    } catch {
      // Weather may be unavailable
    }

    // Night status
    const lockedRooms = motionHandler.getLockedRooms()
    const wakeModeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'",
    )
    const nightStatus = {
      active: lockedRooms.length > 0,
      lockedRooms,
      wakeMode: wakeModeRow?.value || 'Morning',
    }

    // Energy rate preference
    const energyRateRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'pref_energy_rate'",
    )
    const energyRate = energyRateRow?.value ? Number(energyRateRow.value) : 0.30

    // Compute insights from current state + historical data
    const insights = computeInsights({
      power,
      rooms: rooms as Array<{ name: string; temperature: number | null; lux: number | null }>,
      battery,
      weather: weather as { temp: number; humidity: number } | null,
      energyRate,
    })

    res.json({
      mode,
      allModes,
      rooms,
      battery,
      power,
      sunSchedule,
      sunPhase,
      sunTimes,
      weather,
      nightStatus,
      insights,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /history/:source/:sourceId — time-series data with period aggregation
router.get('/history/:source/:sourceId', (req: Request, res: Response) => {
  try {
    const { source, sourceId } = req.params
    const period = (req.query.period as string) || '24h'

    let cutoff: string
    let aggregate = false

    switch (period) {
      case '24h':
        cutoff = "datetime('now', '-1 day')"
        break
      case '7d':
        cutoff = "datetime('now', '-7 days')"
        aggregate = true
        break
      case '30d':
        cutoff = "datetime('now', '-30 days')"
        aggregate = true
        break
      case '1y':
        cutoff = "datetime('now', '-1 year')"
        aggregate = true
        break
      case 'all':
        cutoff = "'1970-01-01'"
        aggregate = true
        break
      default:
        cutoff = "datetime('now', '-1 day')"
    }

    let data: unknown[]
    if (aggregate) {
      data = getAll(
        `SELECT AVG(value) as value, MIN(value) as min, MAX(value) as max,
                strftime('%Y-%m-%d %H:00:00', recorded_at) as recorded_at
         FROM device_history
         WHERE source = ? AND source_id = ? AND recorded_at > ${cutoff}
         GROUP BY strftime('%Y-%m-%d %H', recorded_at)
         ORDER BY recorded_at`,
        [source, sourceId],
      )
    } else {
      data = getAll(
        `SELECT value, recorded_at
         FROM device_history
         WHERE source = ? AND source_id = ? AND recorded_at > ${cutoff}
         ORDER BY recorded_at`,
        [source, sourceId],
      )
    }

    const countResult = db
      .prepare(
        `SELECT COUNT(*) as count FROM device_history WHERE source = ? AND source_id = ? AND recorded_at > ${cutoff}`,
      )
      .get(source, sourceId) as { count: number }

    res.json({ data, count: countResult.count, period })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /stats — database size and history statistics
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getHistoryStats()

    // Get database file size via PRAGMA
    const pageCount = db.pragma('page_count', { simple: true }) as number
    const pageSize = db.pragma('page_size', { simple: true }) as number
    const dbSizeBytes = pageCount * pageSize

    res.json({
      totalRows: stats.totalRows,
      oldestRecord: stats.oldestRecord,
      sources: stats.sources,
      dbSizeBytes,
      dbSizeMB: Math.round((dbSizeBytes / (1024 * 1024)) * 100) / 100,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// DELETE /history — delete historical data with flexible criteria
router.delete('/history', (req: Request, res: Response) => {
  try {
    const { olderThan, source, all } = req.body as {
      olderThan?: string
      source?: string
      all?: boolean
    }

    let deleted = 0

    if (all) {
      const result = run('DELETE FROM device_history')
      deleted = result.changes
    } else if (olderThan && source) {
      const result = run(
        'DELETE FROM device_history WHERE source = ? AND recorded_at < datetime(?)',
        [source, olderThan],
      )
      deleted = result.changes
    } else if (olderThan) {
      const result = run(
        'DELETE FROM device_history WHERE recorded_at < datetime(?)',
        [olderThan],
      )
      deleted = result.changes
    } else if (source) {
      const result = run(
        'DELETE FROM device_history WHERE source = ?',
        [source],
      )
      deleted = result.changes
    } else {
      res.status(400).json({ error: 'Provide at least one of: all, olderThan, source' })
      return
    }

    // Reclaim disk space
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.exec('VACUUM')

    res.json({ deleted })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /device/:id/context — device room and scene context
router.get('/device/:id/context', (req: Request, res: Response) => {
  try {
    const deviceId = req.params.id

    // Room assignments
    const rooms = getAll<{ room_name: string; config: string }>(
      'SELECT room_name, config FROM device_rooms WHERE device_id = ?',
      [deviceId],
    )

    // Scene usage — find scenes whose commands reference this device
    const allScenes = getAll<{ name: string; commands: string }>(
      'SELECT name, commands FROM scenes',
    )
    const scenesUsing = allScenes
      .filter((s) => {
        const cmds = JSON.parse(s.commands) as Array<{ device_id?: string | number }>
        return cmds.some((c) => String(c.device_id) === String(deviceId))
      })
      .map((s) => s.name)

    // Last event from hub_devices
    const device = getOne<{ last_event: string | null; updated_at: string }>(
      'SELECT last_event, updated_at FROM hub_devices WHERE id = ?',
      [Number(deviceId)],
    )

    // Available history sources for this device
    const label = getOne<{ label: string }>(
      'SELECT label FROM hub_devices WHERE id = ?',
      [Number(deviceId)],
    )
    const historySources = label
      ? getAll<{ source: string; count: number }>(
          'SELECT source, COUNT(*) as count FROM device_history WHERE source_id = ? GROUP BY source',
          [label.label],
        )
      : []

    res.json({
      rooms: rooms.map((r) => ({
        room_name: r.room_name,
        config: JSON.parse(r.config || '{}'),
      })),
      scenes: scenesUsing,
      lastEvent: device?.last_event || null,
      updatedAt: device?.updated_at || null,
      historySources,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
