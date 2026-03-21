import Database from 'better-sqlite3'

const db = new Database('./data/thefairies.sqlite')

async function migrate() {
  const res = await fetch('http://localhost:3001/api/lifx/scenes')
  const lifxScenes = (await res.json()) as any[]
  console.log('Fetched', lifxScenes.length, 'LIFX scenes')

  const lifxMap = new Map<string, any[]>()
  for (const ls of lifxScenes) {
    lifxMap.set(ls.name, ls.states || [])
  }

  const ourScenes = db.prepare('SELECT name, commands FROM scenes').all() as any[]
  let totalConverted = 0
  let totalScenes = 0

  for (const scene of ourScenes) {
    let commands: any[]
    try { commands = JSON.parse(scene.commands || '[]') } catch { continue }

    let changed = false
    const newCommands: any[] = []

    for (const cmd of commands) {
      if (cmd.type === 'lifx_scene') {
        const lifxName = cmd.scene_name || cmd.name || ''
        const lifxStates = lifxMap.get(lifxName)

        if (lifxStates && lifxStates.length > 0) {
          for (const state of lifxStates) {
            const selector = state.selector || ''
            if (!selector) continue
            const lightId = selector.replace('id:', '')
            const color = state.color || {}
            const hue = color.hue ?? 0
            const sat = color.saturation ?? 0
            const kelvin = color.kelvin ?? 3500
            const brightness = state.brightness ?? 1
            const power = state.power || 'on'

            let colorStr: string
            if (sat > 0.05) {
              colorStr = `hue:${hue.toFixed(1)} saturation:${sat.toFixed(2)}`
            } else {
              colorStr = `kelvin:${Math.round(kelvin)}`
            }

            newCommands.push({
              type: 'lifx_light',
              name: lifxName,
              light_id: lightId,
              selector,
              color: colorStr,
              brightness: Math.round(brightness * 100) / 100,
              power,
              duration: 1,
            })
          }
          totalConverted++
          changed = true
          console.log(`  ✓ ${scene.name}: "${lifxName}" → ${lifxStates.length} lights`)
        } else {
          console.log(`  ✗ ${scene.name}: "${lifxName}" not found in LIFX, removing`)
          changed = true
        }
      } else {
        newCommands.push(cmd)
      }
    }

    if (changed) {
      db.prepare("UPDATE scenes SET commands = ?, updated_at = datetime('now') WHERE name = ?")
        .run(JSON.stringify(newCommands), scene.name)
      totalScenes++
    }
  }

  console.log()
  console.log('Migration complete:')
  console.log('  Scenes updated:', totalScenes)
  console.log('  LIFX scene refs converted:', totalConverted)

  db.close()
}

migrate().catch(e => { console.error(e); process.exit(1) })
