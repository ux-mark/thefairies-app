import Database, { type Database as DatabaseType } from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const dbPath = process.env.FAIRY_DB_PATH || './data/thefairies.sqlite'
const dbDir = path.dirname(dbPath)

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db: DatabaseType = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      name TEXT PRIMARY KEY,
      display_order INTEGER DEFAULT 0,
      parent_room TEXT,
      auto INTEGER DEFAULT 1,
      timer INTEGER DEFAULT 15,
      tags TEXT DEFAULT '[]',
      current_scene TEXT,
      last_active TEXT,
      scene_manual INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scenes (
      name TEXT PRIMARY KEY,
      icon TEXT DEFAULT '',
      commands TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS light_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      light_id TEXT NOT NULL,
      light_label TEXT NOT NULL,
      light_selector TEXT NOT NULL,
      room_name TEXT NOT NULL REFERENCES rooms(name),
      has_color INTEGER DEFAULT 1,
      min_kelvin INTEGER DEFAULT 2500,
      max_kelvin INTEGER DEFAULT 9000,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(light_id, room_name)
    );

    CREATE TABLE IF NOT EXISTS current_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER,
      seq INTEGER DEFAULT 1,
      message TEXT NOT NULL,
      debug TEXT,
      category TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hub_devices (
      id INTEGER PRIMARY KEY,
      label TEXT NOT NULL,
      device_name TEXT,
      device_type TEXT DEFAULT 'switch',
      capabilities TEXT DEFAULT '[]',
      attributes TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      device_label TEXT NOT NULL,
      device_type TEXT NOT NULL CHECK(device_type IN ('light','switch','sensor','dimmer','contact','motion','twinkly','fairy')),
      room_name TEXT NOT NULL REFERENCES rooms(name),
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(device_id, room_name)
    );

    CREATE TABLE IF NOT EXISTS device_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      value REAL,
      value_text TEXT,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_device_history_lookup
      ON device_history (source, source_id, recorded_at);

    CREATE TABLE IF NOT EXISTS room_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_name TEXT NOT NULL,
      sensor_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_room_activity_lookup
      ON room_activity (room_name, recorded_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'critical')),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source_type TEXT,
      source_id TEXT,
      source_label TEXT,
      dedup_key TEXT,
      occurrence_count INTEGER DEFAULT 1,
      first_occurred_at TEXT DEFAULT (datetime('now')),
      last_occurred_at TEXT DEFAULT (datetime('now')),
      read INTEGER DEFAULT 0,
      dismissed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_unread
      ON notifications (read, dismissed, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_dedup
      ON notifications (dedup_key, dismissed);

    CREATE TABLE IF NOT EXISTS mode_triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode_name TEXT NOT NULL REFERENCES modes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('sun', 'time')),
      sun_event TEXT,
      trigger_time TEXT,
      trigger_days TEXT,
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_mode_triggers_mode
      ON mode_triggers (mode_name);

    CREATE TABLE IF NOT EXISTS modes (
      name TEXT PRIMARY KEY,
      display_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scene_rooms (
      scene_name TEXT NOT NULL REFERENCES scenes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      room_name TEXT NOT NULL REFERENCES rooms(name) ON UPDATE CASCADE ON DELETE CASCADE,
      priority INTEGER DEFAULT 0,
      PRIMARY KEY (scene_name, room_name)
    );

    CREATE TABLE IF NOT EXISTS scene_modes (
      scene_name TEXT NOT NULL REFERENCES scenes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      mode_name TEXT NOT NULL REFERENCES modes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      PRIMARY KEY (scene_name, mode_name)
    );
  `)

  // Migration: add scene_manual column to rooms
  try {
    db.prepare('SELECT scene_manual FROM rooms LIMIT 1').get()
  } catch {
    console.log('[db] Migrating rooms: adding scene_manual column')
    db.exec('ALTER TABLE rooms ADD COLUMN scene_manual INTEGER DEFAULT 0')
  }

  // Migration: add auto_activate column to scenes
  try {
    db.prepare('SELECT auto_activate FROM scenes LIMIT 1').get()
  } catch {
    console.log('[db] Migrating scenes: adding auto_activate column')
    db.exec('ALTER TABLE scenes ADD COLUMN auto_activate INTEGER DEFAULT 1')
  }

  // Migration: add active_from/active_to columns to scenes for seasonal date ranges
  try {
    db.prepare("SELECT active_from FROM scenes LIMIT 1").get()
  } catch {
    console.log('[db] Migrating scenes: adding active_from, active_to columns')
    db.exec("ALTER TABLE scenes ADD COLUMN active_from TEXT")
    db.exec("ALTER TABLE scenes ADD COLUMN active_to TEXT")
  }

  // Migration: add last_activated_at column to scenes for tracking activation history
  try {
    db.prepare('SELECT last_activated_at FROM scenes LIMIT 1').get()
  } catch {
    console.log('[db] Migrating scenes: adding last_activated_at column')
    db.exec('ALTER TABLE scenes ADD COLUMN last_activated_at TEXT DEFAULT NULL')
    // Backfill from logs table
    db.exec(`
      UPDATE scenes SET last_activated_at = (
        SELECT MAX(created_at) FROM logs
        WHERE message LIKE 'Activating scene: ' || scenes.name
        AND category = 'scene'
      )
    `)
    console.log('[db] Backfilled last_activated_at from logs')
  }

  // Migration: fix device_rooms CHECK constraint if it doesn't include twinkly/fairy
  // This handles databases created before the constraint was updated
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'device_rooms'").get() as { sql: string } | undefined
    if (tableInfo?.sql && !tableInfo.sql.includes("'twinkly'")) {
      console.log('[db] Migrating device_rooms: adding twinkly/fairy to CHECK constraint')
      const existingData = db.prepare('SELECT * FROM device_rooms').all()
      db.exec('DROP TABLE device_rooms')
      db.exec(`
        CREATE TABLE device_rooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT NOT NULL,
          device_label TEXT NOT NULL,
          device_type TEXT NOT NULL CHECK(device_type IN ('light','switch','sensor','dimmer','contact','motion','twinkly','fairy')),
          room_name TEXT NOT NULL REFERENCES rooms(name),
          config TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(device_id, room_name)
        )
      `)
      const insert = db.prepare('INSERT INTO device_rooms (device_id, device_label, device_type, room_name, config) VALUES (?, ?, ?, ?, ?)')
      for (const row of existingData as any[]) {
        insert.run(row.device_id, row.device_label, row.device_type, row.room_name, row.config || '{}')
      }
      console.log(`[db] Migrated ${(existingData as any[]).length} device_rooms rows`)
    }
  } catch (e) {
    console.error('[db] Migration warning:', e)
  }

  // Migration: drop dead hub_devices columns
  try {
    db.prepare('SELECT room_name FROM hub_devices LIMIT 1').get()
    console.log('[db] Migrating hub_devices: dropping room_name column')
    db.exec('ALTER TABLE hub_devices DROP COLUMN room_name')
  } catch { /* already dropped */ }

  try {
    db.prepare('SELECT last_event FROM hub_devices LIMIT 1').get()
    console.log('[db] Migrating hub_devices: dropping last_event column')
    db.exec('ALTER TABLE hub_devices DROP COLUMN last_event')
  } catch { /* already dropped */ }

  // Migration: drop dead rooms.mode_changed column
  try {
    db.prepare('SELECT mode_changed FROM rooms LIMIT 1').get()
    console.log('[db] Migrating rooms: dropping mode_changed column')
    db.exec('ALTER TABLE rooms DROP COLUMN mode_changed')
  } catch { /* already dropped */ }

  // Migration: move rooms.sensors JSON → device_rooms table, then drop column
  try {
    db.prepare('SELECT sensors FROM rooms LIMIT 1').get()
    // Column still exists — migrate data
    const roomsWithSensors = db.prepare("SELECT name, sensors FROM rooms WHERE sensors IS NOT NULL AND sensors != '[]'").all() as Array<{ name: string; sensors: string }>
    let migratedCount = 0
    for (const room of roomsWithSensors) {
      try {
        const sensors = JSON.parse(room.sensors)
        if (Array.isArray(sensors)) {
          for (const sensor of sensors) {
            const sensorName = sensor.name || sensor
            if (typeof sensorName === 'string' && sensorName !== 'none') {
              const existing = db.prepare(
                "SELECT 1 FROM device_rooms WHERE device_label = ? AND room_name = ?"
              ).get(sensorName, room.name)
              if (!existing) {
                // Use numeric hub device ID if available, fall back to label
                const hubDevice = db.prepare('SELECT id FROM hub_devices WHERE label = ?').get(sensorName) as { id: number } | undefined
                const deviceId = hubDevice ? String(hubDevice.id) : sensorName
                db.prepare(
                  "INSERT INTO device_rooms (device_id, device_label, device_type, room_name, config) VALUES (?, ?, 'motion', ?, '{}')"
                ).run(deviceId, sensorName, room.name)
                migratedCount++
              }
            }
          }
        }
      } catch { /* skip malformed JSON */ }
    }
    if (migratedCount > 0) {
      console.log(`[db] Migrated ${migratedCount} sensors from rooms.sensors to device_rooms`)
    }
    console.log('[db] Dropping rooms.sensors column')
    db.exec('ALTER TABLE rooms DROP COLUMN sensors')
  } catch { /* sensors column already dropped */ }

  // Migration: populate modes table from all_modes in current_state
  try {
    const modeCount = (db.prepare('SELECT COUNT(*) as cnt FROM modes').get() as { cnt: number }).cnt
    if (modeCount === 0) {
      const modesRow = db.prepare("SELECT value FROM current_state WHERE key = 'all_modes'").get() as { value: string } | undefined
      if (modesRow?.value) {
        try {
          const allModes: string[] = JSON.parse(modesRow.value)
          const insertMode = db.prepare('INSERT OR IGNORE INTO modes (name, display_order) VALUES (?, ?)')
          for (let i = 0; i < allModes.length; i++) {
            insertMode.run(allModes[i], i)
          }
          console.log(`[db] Migrated ${allModes.length} modes from current_state to modes table`)
        } catch { /* malformed JSON */ }
      }
    }
  } catch (e) {
    console.error('[db] Migration warning (modes):', e)
  }

  // Migration: rebuild mode_triggers with FK to modes table
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'mode_triggers'").get() as { sql: string } | undefined
    if (tableInfo?.sql && !tableInfo.sql.includes('REFERENCES modes')) {
      // Ensure modes table has data before rebuilding with FK
      const mCount = (db.prepare('SELECT COUNT(*) as cnt FROM modes').get() as { cnt: number }).cnt
      if (mCount === 0) {
        console.warn('[db] Skipping mode_triggers FK rebuild: modes table is empty')
      } else {
        console.log('[db] Rebuilding mode_triggers with FK to modes table')
        const existingData = db.prepare('SELECT * FROM mode_triggers').all()
        // Ensure all referenced modes exist
        const existingModes = new Set(db.prepare('SELECT name FROM modes').all().map((m: any) => m.name))
        const insertMissing = db.prepare('INSERT OR IGNORE INTO modes (name, display_order) VALUES (?, ?)')
        for (const row of existingData as any[]) {
          if (!existingModes.has(row.mode_name)) {
            insertMissing.run(row.mode_name, existingModes.size)
            existingModes.add(row.mode_name)
            console.log(`[db] Added missing mode "${row.mode_name}" to modes table (referenced by trigger)`)
          }
        }
        db.exec('DROP TABLE mode_triggers')
        db.exec(`
          CREATE TABLE mode_triggers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode_name TEXT NOT NULL REFERENCES modes(name) ON UPDATE CASCADE ON DELETE CASCADE,
            trigger_type TEXT NOT NULL CHECK(trigger_type IN ('sun', 'time')),
            sun_event TEXT,
            trigger_time TEXT,
            trigger_days TEXT,
            priority INTEGER DEFAULT 0,
            enabled INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `)
        db.exec('CREATE INDEX IF NOT EXISTS idx_mode_triggers_mode ON mode_triggers (mode_name)')
        const insert = db.prepare(
          'INSERT INTO mode_triggers (id, mode_name, trigger_type, sun_event, trigger_time, trigger_days, priority, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        for (const row of existingData as any[]) {
          insert.run(row.id, row.mode_name, row.trigger_type, row.sun_event, row.trigger_time, row.trigger_days, row.priority, row.enabled, row.created_at)
        }
        console.log(`[db] Rebuilt mode_triggers with ${(existingData as any[]).length} rows`)
      }
    }
  } catch (e) {
    console.error('[db] Migration warning (mode_triggers FK):', e)
  }

  // Migration: populate scene_rooms and scene_modes from JSON columns, then drop them
  try {
    db.prepare('SELECT rooms FROM scenes LIMIT 1').get()
    // Column still exists — migrate data
    const scenes = db.prepare('SELECT name, rooms, modes FROM scenes').all() as Array<{ name: string; rooms: string; modes: string }>
    let roomCount = 0, modeCount = 0
    const insertRoom = db.prepare('INSERT OR IGNORE INTO scene_rooms (scene_name, room_name, priority) VALUES (?, ?, ?)')
    const insertMode = db.prepare('INSERT OR IGNORE INTO scene_modes (scene_name, mode_name) VALUES (?, ?)')

    // Pre-pass: ensure all modes referenced in scenes exist in modes table
    const existingModes = new Set(db.prepare('SELECT name FROM modes').all().map((m: any) => m.name))
    const insertMissingMode = db.prepare('INSERT OR IGNORE INTO modes (name, display_order) VALUES (?, ?)')
    for (const scene of scenes) {
      try {
        const modes = JSON.parse(scene.modes || '[]')
        if (Array.isArray(modes)) {
          for (const mode of modes) {
            if (typeof mode === 'string' && mode && !existingModes.has(mode)) {
              insertMissingMode.run(mode, existingModes.size)
              existingModes.add(mode)
              console.log(`[db] Added missing mode "${mode}" to modes table (referenced by scene "${scene.name}")`)
            }
          }
        }
      } catch { /* skip */ }
    }

    for (const scene of scenes) {
      try {
        const rooms = JSON.parse(scene.rooms || '[]')
        if (Array.isArray(rooms)) {
          for (const room of rooms) {
            if (room?.name) {
              insertRoom.run(scene.name, room.name, Number(room.priority) || 0)
              roomCount++
            }
          }
        }
      } catch { /* skip */ }

      try {
        const modes = JSON.parse(scene.modes || '[]')
        if (Array.isArray(modes)) {
          for (const mode of modes) {
            if (typeof mode === 'string' && mode) {
              insertMode.run(scene.name, mode)
              modeCount++
            }
          }
        }
      } catch { /* skip */ }
    }

    if (roomCount > 0 || modeCount > 0) {
      console.log(`[db] Migrated ${roomCount} scene-room and ${modeCount} scene-mode entries`)
    }

    console.log('[db] Dropping scenes.rooms and scenes.modes columns')
    db.exec('ALTER TABLE scenes DROP COLUMN rooms')
    db.exec('ALTER TABLE scenes DROP COLUMN modes')
  } catch { /* columns already dropped */ }

  // Migration: drop rooms.temperature and rooms.lux cache columns
  try {
    db.prepare('SELECT temperature FROM rooms LIMIT 1').get()
    console.log('[db] Dropping rooms.temperature and rooms.lux cache columns')
    db.exec('ALTER TABLE rooms DROP COLUMN temperature')
    db.exec('ALTER TABLE rooms DROP COLUMN lux')
  } catch { /* already dropped */ }

  // Migration: remove all_modes from current_state (modes table is now source of truth)
  try {
    const allModesRow = db.prepare("SELECT 1 FROM current_state WHERE key = 'all_modes'").get()
    if (allModesRow) {
      db.prepare("DELETE FROM current_state WHERE key = 'all_modes'").run()
      console.log('[db] Removed all_modes from current_state (modes table is source of truth)')
    }
  } catch { /* ignore */ }

  // Migration: seed default mode triggers if mode_triggers table is empty
  try {
    // First ensure modes table is seeded
    const modeCount = (db.prepare('SELECT COUNT(*) as cnt FROM modes').get() as { cnt: number }).cnt
    if (modeCount === 0) {
      const defaultModes = ['Early Morning', 'Morning', 'Afternoon', 'Evening', 'Late Evening', 'Night', 'Sleep Time']
      const insertMode = db.prepare('INSERT OR IGNORE INTO modes (name, display_order) VALUES (?, ?)')
      for (let i = 0; i < defaultModes.length; i++) {
        insertMode.run(defaultModes[i], i)
      }
    }

    const triggerCount = db.prepare('SELECT COUNT(*) as cnt FROM mode_triggers').get() as { cnt: number }
    if (triggerCount.cnt === 0) {
      console.log('[db] Seeding default sun mode triggers')
      const defaultSunTriggers = [
        { mode: 'Early Morning', event: 'nightEnd', priority: 10 },
        { mode: 'Morning', event: 'dawn', priority: 10 },
        { mode: 'Afternoon', event: 'solarNoon', priority: 10 },
        { mode: 'Evening', event: 'goldenHour', priority: 10 },
        { mode: 'Late Evening', event: 'dusk', priority: 10 },
        { mode: 'Night', event: 'night', priority: 10 },
      ]
      const insertTrigger = db.prepare(
        `INSERT INTO mode_triggers (mode_name, trigger_type, sun_event, priority)
         VALUES (?, 'sun', ?, ?)`
      )
      for (const t of defaultSunTriggers) {
        insertTrigger.run(t.mode, t.event, t.priority)
      }

      // Set default sleep mode name if not already set
      const sleepRow = db.prepare("SELECT value FROM current_state WHERE key = 'sleep_mode_name'").get() as { value: string } | undefined
      if (!sleepRow) {
        db.prepare(
          `INSERT INTO current_state (key, value, updated_at) VALUES ('sleep_mode_name', 'Sleep Time', datetime('now'))
           ON CONFLICT(key) DO NOTHING`
        ).run()
      }
    }
  } catch (e) {
    console.error('[db] Migration warning (mode_triggers seed):', e)
  }
}

export function getAll<T>(sql: string, params?: unknown[]): T[] {
  const stmt = db.prepare(sql)
  return (params ? stmt.all(...params) : stmt.all()) as T[]
}

export function getOne<T>(sql: string, params?: unknown[]): T | undefined {
  const stmt = db.prepare(sql)
  return (params ? stmt.get(...params) : stmt.get()) as T | undefined
}

export function run(sql: string, params?: unknown[]): Database.RunResult {
  const stmt = db.prepare(sql)
  return params ? stmt.run(...params) : stmt.run()
}

export { db }
