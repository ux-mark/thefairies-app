/**
 * Fix lifx_light command names: replace LIFX scene name with actual light label
 */
import Database from 'better-sqlite3'

const db = new Database('./data/thefairies.sqlite')

async function main() {
  // Get LIFX light labels
  const res = await fetch('http://localhost:3001/api/lifx/lights')
  const lights = (await res.json()) as any[]
  const labelMap = new Map<string, string>()
  for (const l of lights) labelMap.set(l.id, l.label)
  console.log(`Fetched ${lights.length} LIFX light labels`)

  // Fix all scenes
  const scenes = db.prepare('SELECT name, commands FROM scenes').all() as any[]
  let totalFixed = 0
  let scenesFixed = 0

  for (const scene of scenes) {
    let commands: any[]
    try { commands = JSON.parse(scene.commands || '[]') } catch { continue }

    let changed = false
    for (const cmd of commands) {
      if (cmd.type === 'lifx_light' && cmd.light_id) {
        const label = labelMap.get(cmd.light_id)
        if (label && cmd.name !== label) {
          cmd.name = label
          changed = true
          totalFixed++
        }
      }
    }

    if (changed) {
      db.prepare("UPDATE scenes SET commands = ?, updated_at = datetime('now') WHERE name = ?")
        .run(JSON.stringify(commands), scene.name)
      scenesFixed++
    }
  }

  console.log(`Fixed ${totalFixed} light names across ${scenesFixed} scenes`)
  db.close()
}

main().catch(e => { console.error(e); process.exit(1) })
