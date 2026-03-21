import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run, db } from '../db/index.js'
import { getCurrentWeather } from '../lib/weather-client.js'
import { getSunTimes, getCurrentSunPhase } from '../lib/sun-tracker.js'
import { timerManager } from '../lib/timer-manager.js'
import { sunModeScheduler } from '../lib/sun-mode-scheduler.js'

const router = Router()

interface CurrentStateRow {
  key: string
  value: string
  updated_at: string
}

interface LogRow {
  id: number
  parent_id: number | null
  seq: number
  message: string
  debug: string | null
  category: string | null
  created_at: string
}

const modeSchema = z.object({
  mode: z.string().min(1),
})

// GET /current — get current mode and all available modes
router.get('/current', (_req: Request, res: Response) => {
  try {
    const modeRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'mode'",
    )
    const modesRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try {
      allModes = modesRow?.value ? JSON.parse(modesRow.value) : []
    } catch { allModes = [] }

    res.json({
      mode: modeRow?.value ?? 'Evening',
      all_modes: allModes,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /preferences — get user preferences
router.get('/preferences', (_req: Request, res: Response) => {
  try {
    const rows = getAll<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key LIKE 'pref_%'",
    )
    const prefs: Record<string, string> = {}
    for (const row of rows) {
      prefs[row.key.replace('pref_', '')] = row.value
    }
    res.json(prefs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /preferences — set a user preference
router.put('/preferences', (req: Request, res: Response) => {
  try {
    const { key, value } = req.body
    if (!key || value === undefined) {
      res.status(400).json({ error: 'key and value required' })
      return
    }
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [`pref_${key}`, String(value)],
    )
    res.json({ key, value })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /mode — update current mode
router.put('/mode', (req: Request, res: Response) => {
  try {
    const body = modeSchema.parse(req.body)
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES ('mode', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [body.mode],
    )
    res.json({ mode: body.mode })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /health — health check
router.get('/health', (_req: Request, res: Response) => {
  try {
    // Quick DB check
    const dbOk = (() => {
      try {
        db.prepare('SELECT 1').get()
        return true
      } catch {
        return false
      }
    })()

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      db: dbOk ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /logs — get recent logs with pagination and optional category filter
router.get('/logs', (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const category = req.query.category as string | undefined

    let rows: LogRow[]
    if (category) {
      rows = getAll<LogRow>(
        'SELECT * FROM logs WHERE category = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [category, limit, offset],
      )
    } else {
      rows = getAll<LogRow>(
        'SELECT * FROM logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset],
      )
    }
    res.json(rows)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /weather — current weather from OpenWeather
router.get('/weather', async (_req: Request, res: Response) => {
  try {
    const weather = await getCurrentWeather()
    res.json(weather)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /sun — sun times from suncalc
router.get('/sun', (_req: Request, res: Response) => {
  try {
    const times = getSunTimes()
    const phase = getCurrentSunPhase()
    res.json({ ...times, phase })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /sun-schedule — today's automatic mode transition schedule
router.get('/sun-schedule', (_req: Request, res: Response) => {
  try {
    const schedule = sunModeScheduler.getSchedule()
    res.json(schedule)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /timers — active scene timers
router.get('/timers', (_req: Request, res: Response) => {
  try {
    res.json(timerManager.getStatus())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /timers/cancel/:id — cancel a timer
router.post('/timers/cancel/:id', (req: Request, res: Response) => {
  try {
    const cancelled = timerManager.cancelTimer(String(req.params.id))
    if (!cancelled) {
      res.status(404).json({ error: 'Timer not found' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /timers/cancel-all — cancel all timers
router.post('/timers/cancel-all', (_req: Request, res: Response) => {
  try {
    timerManager.cancelAll()
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /modes — get all modes
router.get('/modes', (_req: Request, res: Response) => {
  try {
    const modesRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try {
      allModes = modesRow?.value ? JSON.parse(modesRow.value) : []
    } catch { allModes = [] }
    res.json(allModes)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /modes — add a mode
router.post('/modes', (req: Request, res: Response) => {
  try {
    const body = modeSchema.parse(req.body)
    const modesRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try {
      allModes = modesRow?.value ? JSON.parse(modesRow.value) : []
    } catch { allModes = [] }

    if (allModes.includes(body.mode)) {
      res.status(409).json({ error: 'Mode already exists' })
      return
    }

    allModes.push(body.mode)
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES ('all_modes', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(allModes)],
    )
    res.json(allModes)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// DELETE /modes/:mode — remove a mode
router.delete('/modes/:mode', (req: Request, res: Response) => {
  try {
    const modeName = decodeURIComponent(String(req.params.mode))
    const modesRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try {
      allModes = modesRow?.value ? JSON.parse(modesRow.value) : []
    } catch { allModes = [] }

    const idx = allModes.indexOf(modeName)
    if (idx === -1) {
      res.status(404).json({ error: 'Mode not found' })
      return
    }

    allModes.splice(idx, 1)
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES ('all_modes', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(allModes)],
    )
    res.json(allModes)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
