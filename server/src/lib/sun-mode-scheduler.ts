import { getSunTimes, type SunTimes } from './sun-tracker.js'
import { run } from '../db/index.js'
import type { Server as SocketServer } from 'socket.io'

interface SunModeMapping {
  sunPhase: string
  mode: string
  time: Date
}

// Default mappings -- these can be overridden via settings
const DEFAULT_SUN_MODE_MAP: Record<string, string> = {
  nightEnd: 'Early Morning',     // ~5:30am astronomical dawn
  dawn: 'Morning',               // civil dawn
  solarNoon: 'Afternoon',        // midday
  goldenHour: 'Evening',         // ~1hr before sunset
  dusk: 'Late Evening',          // civil dusk
  night: 'Night',                // astronomical night
}

class SunModeScheduler {
  private timers: ReturnType<typeof setTimeout>[] = []
  private io: SocketServer | null = null

  init(socketIo?: SocketServer) {
    this.io = socketIo ?? null
    this.scheduleToday()
    this.scheduleMidnightRefresh()
  }

  scheduleToday() {
    this.clearTimers()

    const sunTimes = getSunTimes()
    const now = new Date()
    const mappings = this.getMappings(sunTimes)

    for (const mapping of mappings) {
      const delay = mapping.time.getTime() - now.getTime()
      if (delay > 0) {
        const timer = setTimeout(() => {
          this.transitionMode(mapping.mode, mapping.sunPhase)
        }, delay)
        this.timers.push(timer)
      }
    }

    this.logSchedule(mappings)
  }

  private getMappings(sunTimes: SunTimes): SunModeMapping[] {
    const mappings: SunModeMapping[] = []
    const timesRecord: Record<string, string> = { ...sunTimes }
    for (const [phase, mode] of Object.entries(DEFAULT_SUN_MODE_MAP)) {
      const iso = timesRecord[phase]
      if (!iso) continue
      const time = new Date(iso)
      if (!isNaN(time.getTime())) {
        mappings.push({ sunPhase: phase, mode, time })
      }
    }
    return mappings.sort((a, b) => a.time.getTime() - b.time.getTime())
  }

  private transitionMode(mode: string, sunPhase: string) {
    try {
      run(
        `INSERT INTO current_state (key, value, updated_at) VALUES ('mode', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [mode],
      )
      run(
        'INSERT INTO logs (message, category) VALUES (?, ?)',
        [`Auto mode transition: ${mode} (triggered by ${sunPhase})`, 'system'],
      )
      if (this.io) {
        this.io.emit('mode_changed', { mode, trigger: sunPhase, auto: true })
      }
    } catch (err) {
      console.error('Failed to transition mode:', err)
    }
  }

  private scheduleMidnightRefresh() {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 30, 0) // 00:00:30 to avoid exact midnight edge cases

    const delay = tomorrow.getTime() - now.getTime()
    const timer = setTimeout(() => {
      this.scheduleToday()
      this.scheduleMidnightRefresh()
    }, delay)
    this.timers.push(timer)
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }

  getSchedule(): { sunPhase: string; mode: string; time: string; isPast: boolean }[] {
    const sunTimes = getSunTimes()
    const now = new Date()
    return this.getMappings(sunTimes).map(m => ({
      sunPhase: m.sunPhase,
      mode: m.mode,
      time: m.time.toISOString(),
      isPast: m.time.getTime() < now.getTime(),
    }))
  }

  private logSchedule(mappings: SunModeMapping[]) {
    const schedule = mappings
      .map(m => `${m.sunPhase} -> ${m.mode} at ${m.time.toLocaleTimeString()}`)
      .join(', ')
    try {
      run(
        'INSERT INTO logs (message, category) VALUES (?, ?)',
        [`Sun mode schedule: ${schedule}`, 'system'],
      )
    } catch {
      // ignore logging failures
    }
  }
}

export const sunModeScheduler = new SunModeScheduler()
