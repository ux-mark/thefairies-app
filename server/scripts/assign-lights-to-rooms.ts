import Database from 'better-sqlite3'

const db = new Database('./data/thefairies.sqlite')

async function main() {
  // Get all LIFX lights for label/capability lookup
  const res = await fetch('http://localhost:3001/api/lifx/lights')
  const lifxLights = (await res.json()) as any[]
  const lightMap = new Map<string, any>()
  for (const l of lifxLights) lightMap.set(l.id, l)

  console.log(`Fetched ${lifxLights.length} LIFX lights\n`)

  // Get all scenes with room+light data
  const scenes = db.prepare('SELECT name, rooms, commands FROM scenes').all() as any[]

  // Build: light_id → room name counts
  const lightRoomCounts = new Map<string, Map<string, number>>()

  for (const scene of scenes) {
    let rooms: any[], commands: any[]
    try {
      rooms = JSON.parse(scene.rooms || '[]')
      commands = JSON.parse(scene.commands || '[]')
    } catch { continue }

    // Only consider rooms with 1-2 entries (room-specific scenes, not system scenes)
    const roomNames = rooms.filter((r: any) => r?.name).map((r: any) => r.name)
    if (roomNames.length > 4) continue // Skip system-level scenes like All Off, Cleaning

    for (const cmd of commands) {
      if (cmd.type === 'lifx_light' && cmd.light_id) {
        for (const roomName of roomNames) {
          if (roomName === 'Automated') continue
          if (!lightRoomCounts.has(cmd.light_id)) lightRoomCounts.set(cmd.light_id, new Map())
          const counts = lightRoomCounts.get(cmd.light_id)!
          counts.set(roomName, (counts.get(roomName) || 0) + 1)
        }
      }
    }
  }

  // Determine best room for each light
  const assignments: { lightId: string; label: string; room: string; hasColor: boolean; minKelvin: number; maxKelvin: number }[] = []

  console.log('Light → Room assignments (from scene analysis):')
  for (const [lightId, roomCounts] of lightRoomCounts) {
    const light = lightMap.get(lightId)
    if (!light) continue

    const sorted = [...roomCounts.entries()].sort((a, b) => b[1] - a[1])
    const bestRoom = sorted[0][0]
    const others = sorted.slice(1).map(([r]) => r).join(', ')

    assignments.push({
      lightId,
      label: light.label,
      room: bestRoom,
      hasColor: light.product?.capabilities?.has_color ?? true,
      minKelvin: light.product?.capabilities?.min_kelvin ?? 2500,
      maxKelvin: light.product?.capabilities?.max_kelvin ?? 9000,
    })

    console.log(`  ${light.label.padEnd(22)} → ${bestRoom}${others ? ` (also: ${others})` : ''}`)
  }

  // Show unassigned lights
  console.log('\nLights NOT found in any scene:')
  for (const light of lifxLights) {
    if (!lightRoomCounts.has(light.id)) {
      console.log(`  ${light.label} (LIFX group: ${light.group.name})`)
    }
  }

  // Clear existing light_rooms and insert new assignments
  console.log('\n--- Applying assignments ---')
  db.prepare('DELETE FROM light_rooms').run()
  console.log('Cleared existing light_rooms')

  const insert = db.prepare(
    `INSERT OR IGNORE INTO light_rooms (light_id, light_label, light_selector, room_name, has_color, min_kelvin, max_kelvin)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  let count = 0
  for (const a of assignments) {
    // Verify room exists
    const room = db.prepare('SELECT name FROM rooms WHERE name = ?').get(a.room) as any
    if (!room) {
      console.log(`  ✗ Skipping ${a.label} → ${a.room} (room not found)`)
      continue
    }
    insert.run(a.lightId, a.label, `id:${a.lightId}`, a.room, a.hasColor ? 1 : 0, a.minKelvin, a.maxKelvin)
    count++
  }

  console.log(`\nAssigned ${count} lights to rooms`)

  // Summary by room
  const summary = db.prepare('SELECT room_name, count(*) as cnt FROM light_rooms GROUP BY room_name ORDER BY room_name').all() as any[]
  console.log('\nSummary:')
  for (const s of summary) {
    console.log(`  ${s.room_name}: ${s.cnt} lights`)
  }

  db.close()
}

main().catch(e => { console.error(e); process.exit(1) })
