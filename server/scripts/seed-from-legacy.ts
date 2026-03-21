/**
 * Seed script: migrates data from the legacy Fairies database export
 * Run: npx tsx scripts/seed-from-legacy.ts
 *
 * Reads /tmp/thefairies-seed.json (exported via sqlite3 .mode json)
 * which contains 4 concatenated JSON arrays: rooms, scenes, current, fairy_devices
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.FAIRY_DB_PATH || path.join(__dirname, '..', 'data', 'thefairies.sqlite')
const SEED_FILE = '/tmp/thefairies-seed.json'

// Parse the concatenated JSON arrays from the seed file
function parseSeedFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const arrays: any[][] = []
  let depth = 0
  let start = 0

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '[') {
      if (depth === 0) start = i
      depth++
    } else if (content[i] === ']') {
      depth--
      if (depth === 0) {
        arrays.push(JSON.parse(content.slice(start, i + 1)))
      }
    }
  }
  return arrays
}

function main() {
  console.log('🧚 The Fairies are migrating data from the legacy database...\n')

  if (!fs.existsSync(SEED_FILE)) {
    console.error(`❌ Seed file not found at ${SEED_FILE}`)
    console.error('Run this on the Pi first:')
    console.error('ssh queen@192.168.10.201 "sqlite3 /home/queen/thefairies/be/data/thefairies.sqlite \'.mode json\' \'SELECT * FROM rooms;\' \'SELECT * FROM scenes;\' \'SELECT * FROM current;\' \'SELECT * FROM fairy_devices;\'" > /tmp/thefairies-seed.json')
    process.exit(1)
  }

  const [rooms, scenes, currentArr, fairyDevices] = parseSeedFile(SEED_FILE)
  console.log(`📦 Found: ${rooms.length} rooms, ${scenes.length} scenes, ${fairyDevices.length} fairy devices\n`)

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  // Delete existing database to start fresh
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH)
    console.log('🗑️  Removed existing database')
  }

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      name TEXT PRIMARY KEY,
      display_order INTEGER DEFAULT 0,
      parent_room TEXT DEFAULT '',
      auto INTEGER DEFAULT 1,
      timer INTEGER DEFAULT 15,
      sensors TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      current_scene TEXT,
      last_active TEXT,
      temperature REAL,
      lux REAL,
      mode_changed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scenes (
      name TEXT PRIMARY KEY,
      icon TEXT DEFAULT '',
      rooms TEXT DEFAULT '[]',
      modes TEXT DEFAULT '[]',
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
  `)
  console.log('✅ Tables created\n')

  // Seed rooms
  const insertRoom = db.prepare(`
    INSERT OR REPLACE INTO rooms (name, display_order, parent_room, auto, timer, sensors, tags, current_scene, last_active, temperature, lux, mode_changed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let roomCount = 0
  for (const room of rooms) {
    // Parse sensors - legacy format stores as JSON string with priorityThreshold
    let sensors = '[]'
    try {
      const parsed = JSON.parse(room.sensors || '[]')
      sensors = JSON.stringify(parsed.map((s: any) => ({
        name: s.name,
        priority_threshold: s.priorityThreshold || 50
      })))
    } catch { sensors = '[]' }

    // Parse tags
    let tags = '[]'
    try { tags = room.tags || '[]' } catch { tags = '[]' }

    // Convert lastActive timestamp to ISO string
    let lastActive: string | null = null
    if (room.lastActive) {
      lastActive = new Date(room.lastActive).toISOString()
    }

    insertRoom.run(
      room.name,
      room.order || 0,
      room.parentRoom || '',
      room.auto ? 1 : 0,
      room.timer || 15,
      sensors,
      tags,
      room.currentScene || null,
      lastActive,
      room.temperature || null,
      room.lux || null,
      room.modeChanged ? 1 : 0,
      room.created_at || new Date().toISOString(),
      room.updated_at || new Date().toISOString()
    )
    roomCount++
    console.log(`  🏠 Room: ${room.name} (order: ${room.order}, auto: ${room.auto ? 'ON' : 'OFF'}, timer: ${room.timer}m)`)
  }
  console.log(`\n✅ ${roomCount} rooms seeded\n`)

  // Seed scenes
  const insertScene = db.prepare(`
    INSERT OR REPLACE INTO scenes (name, icon, rooms, modes, commands, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let sceneCount = 0
  for (const scene of scenes) {
    // Parse rooms - legacy format: [{name, priority}]
    let sceneRooms = '[]'
    try { sceneRooms = scene.rooms || '[]' } catch { sceneRooms = '[]' }

    // Parse modes - legacy stores as "mode", new schema uses "modes"
    let modes = '[]'
    try { modes = scene.mode || '[]' } catch { modes = '[]' }

    // Parse commands - map legacy types to new types
    let commands = '[]'
    try {
      const parsed = JSON.parse(scene.commands || '[]')
      const mapped = parsed.map((cmd: any) => {
        // Map legacy command types to new format
        let type = cmd.type || ''
        switch (type) {
          case 'lifx scene': type = 'lifx_scene'; break
          case 'lifx toggle': type = 'lifx_light'; break
          case 'lifx off': type = 'lifx_off'; break
          case 'hubitat device': type = 'hubitat_device'; break
          case 'all off': type = 'all_off'; break
          case 'scene timer': type = 'scene_timer'; break
          case 'mode update': type = 'mode_update'; break
          case 'fairy device': type = 'fairy_device'; break
          case 'fairy scene': type = 'fairy_scene'; break
          case 'twinkly': type = 'twinkly'; break
          case 'sonos group': type = 'sonos_group'; break
          case 'sonos play': type = 'sonos_play'; break
          case 'sonos volume': type = 'sonos_volume'; break
          case 'sonos stop': type = 'sonos_stop'; break
          case 'mta check': type = 'mta_check'; break
          default:
            // Keep as-is if already in new format or unknown
            if (type.includes(' ')) type = type.replace(/\s+/g, '_')
        }
        return {
          type,
          name: cmd.name || '',
          command: cmd.command || '',
          id: cmd.id || '',
          auto: cmd.auto || ''
        }
      })
      commands = JSON.stringify(mapped)
    } catch { commands = '[]' }

    // Parse tags
    let tags = '[]'
    try { tags = scene.tags || '[]' } catch { tags = '[]' }

    insertScene.run(
      scene.name,
      scene.icon || '',
      sceneRooms,
      modes,
      commands,
      tags,
      scene.created_at || new Date().toISOString(),
      scene.updated_at || new Date().toISOString()
    )
    sceneCount++
    console.log(`  ✨ Scene: ${scene.icon || '?'} ${scene.name}`)
  }
  console.log(`\n✅ ${sceneCount} scenes seeded\n`)

  // Seed current state
  if (currentArr && currentArr.length > 0) {
    const current = currentArr[0]
    const insertState = db.prepare('INSERT OR REPLACE INTO current_state (key, value, updated_at) VALUES (?, ?, ?)')

    insertState.run('mode', current.value || 'Evening', new Date().toISOString())

    // Store all available modes
    let allModes = '[]'
    try { allModes = current.allModes || '[]' } catch { allModes = '[]' }
    insertState.run('all_modes', allModes, new Date().toISOString())

    // Store day/sun data if available
    if (current.day) {
      insertState.run('day', typeof current.day === 'string' ? current.day : JSON.stringify(current.day), new Date().toISOString())
    }

    console.log(`✅ Current mode: ${current.value}`)
    try {
      const modes = JSON.parse(allModes)
      console.log(`   Available modes: ${Array.isArray(modes) ? modes.join(', ') : allModes}`)
    } catch {
      console.log(`   Available modes: ${allModes}`)
    }
  }

  // Log seed summary
  const insertLog = db.prepare('INSERT INTO logs (message, category, created_at) VALUES (?, ?, ?)')
  insertLog.run(
    `Database seeded from legacy export: ${roomCount} rooms, ${sceneCount} scenes`,
    'system',
    new Date().toISOString()
  )

  db.close()

  console.log('\n🧚 Migration complete! The Fairies have moved into their new home.')
  console.log(`   Database: ${DB_PATH}`)
  console.log(`   Rooms: ${roomCount}`)
  console.log(`   Scenes: ${sceneCount}`)
  console.log('\n   Run "npm run dev" to start the app.')
}

main()
