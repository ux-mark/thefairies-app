import { lifxClient, BatchState } from './lifx-client.js'
import { hubitatClient } from './hubitat-client.js'
import { getAll, getOne, run } from '../db/index.js'

interface LightCommand {
  type: 'lifx_light'
  light_id: string
  selector: string
  color?: string
  brightness?: number
  power?: string
  duration?: number
}

interface SceneCommand {
  type: 'lifx_scene'
  scene_name: string
  duration?: number
}

interface AllOffCommand {
  type: 'all_off'
  duration?: number
}

interface LightOffCommand {
  type: 'lifx_off'
  selector: string
  duration?: number
}

interface HubitatDeviceCommand {
  type: 'hubitat_device'
  device_id: number | string
  command: string
  value?: string | number
}

type Command = LightCommand | SceneCommand | AllOffCommand | LightOffCommand | HubitatDeviceCommand

interface SceneRow {
  name: string
  icon: string
  rooms: string
  modes: string
  commands: string
  tags: string
}

interface RoomInfo {
  name: string
  priority: number
}

function log(message: string, category = 'scene'): void {
  try {
    run(
      'INSERT INTO logs (message, category) VALUES (?, ?)',
      [message, category],
    )
  } catch {
    console.error('Failed to write log:', message)
  }
}

export async function activateScene(sceneName: string): Promise<void> {
  const scene = getOne<SceneRow>(
    'SELECT * FROM scenes WHERE name = ?',
    [sceneName],
  )
  if (!scene) {
    throw new Error(`Scene not found: ${sceneName}`)
  }

  const commands: Command[] = JSON.parse(scene.commands)
  const rooms: RoomInfo[] = JSON.parse(scene.rooms)

  log(`Activating scene: ${sceneName}`)

  // Collect lifx_light commands for batching
  const lightCommands: LightCommand[] = []
  const otherCommands: Command[] = []

  for (const cmd of commands) {
    if (cmd.type === 'lifx_light') {
      lightCommands.push(cmd)
    } else {
      otherCommands.push(cmd)
    }
  }

  // Batch all lifx_light commands into a single setStates call
  if (lightCommands.length > 0) {
    try {
      const states: BatchState[] = lightCommands.map((cmd) => {
        const state: BatchState = { selector: cmd.selector }
        if (cmd.power !== undefined) state.power = cmd.power
        if (cmd.color !== undefined) state.color = cmd.color
        if (cmd.brightness !== undefined) state.brightness = cmd.brightness
        if (cmd.duration !== undefined) state.duration = cmd.duration
        return state
      })
      await lifxClient.setStates(states)
      log(`Batch set ${states.length} light(s) via setStates`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error in batch setStates: ${msg}`)
    }
  }

  // Execute remaining commands sequentially
  for (const cmd of otherCommands) {
    try {
      switch (cmd.type) {
        case 'lifx_scene': {
          const scenes = await lifxClient.listScenes()
          const target = scenes.find(
            (s: { name: string }) => s.name === cmd.scene_name,
          )
          if (target) {
            await lifxClient.activateScene(target.uuid, cmd.duration ?? 1)
            log(`Activated LIFX scene: ${cmd.scene_name}`)
          } else {
            log(`LIFX scene not found: ${cmd.scene_name}`)
          }
          break
        }

        case 'all_off': {
          await lifxClient.setState('all', {
            power: 'off',
            duration: cmd.duration ?? 1,
          })
          // Also turn off Hubitat switches assigned to rooms in this scene
          for (const room of rooms) {
            const hubDevices = getAll<{ device_id: string }>(
              "SELECT device_id FROM device_rooms WHERE room_name = ? AND device_type IN ('switch', 'dimmer', 'light')",
              [room.name],
            )
            for (const dev of hubDevices) {
              try {
                await hubitatClient.sendCommand(dev.device_id, 'off')
              } catch {
                // best effort
              }
            }
          }
          log('Turned off all lights and Hubitat switches')
          break
        }

        case 'lifx_off': {
          await lifxClient.setState(cmd.selector, {
            power: 'off',
            duration: cmd.duration ?? 1,
          })
          log(`Turned off light: ${cmd.selector}`)
          break
        }

        case 'hubitat_device': {
          if (cmd.value !== undefined) {
            await hubitatClient.sendCommandWithValue(cmd.device_id, cmd.command, cmd.value)
          } else {
            await hubitatClient.sendCommand(cmd.device_id, cmd.command)
          }
          log(`Hubitat device ${cmd.device_id}: ${cmd.command}${cmd.value !== undefined ? ` ${cmd.value}` : ''}`)
          break
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error executing command ${cmd.type}: ${msg}`)
    }
  }

  // Update current_scene for each room in the scene
  for (const room of rooms) {
    run(
      `UPDATE rooms SET current_scene = ?, updated_at = datetime('now') WHERE name = ?`,
      [sceneName, room.name],
    )
  }
}

export async function deactivateScene(sceneName: string): Promise<void> {
  const scene = getOne<SceneRow>(
    'SELECT * FROM scenes WHERE name = ?',
    [sceneName],
  )
  if (!scene) {
    throw new Error(`Scene not found: ${sceneName}`)
  }

  const rooms: RoomInfo[] = JSON.parse(scene.rooms)
  const commands: Command[] = JSON.parse(scene.commands)

  log(`Deactivating scene: ${sceneName}`)

  // Batch turn off all lifx_light commands
  const lightCommands = commands.filter(
    (cmd): cmd is LightCommand => cmd.type === 'lifx_light',
  )

  if (lightCommands.length > 0) {
    try {
      const states: BatchState[] = lightCommands.map((cmd) => ({
        selector: cmd.selector,
        power: 'off',
        duration: 1,
      }))
      await lifxClient.setStates(states)
      log(`Batch turned off ${states.length} light(s)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error in batch deactivate: ${msg}`)
    }
  }

  // Turn off Hubitat devices referenced in scene commands
  const hubitatCommands = commands.filter(
    (cmd): cmd is HubitatDeviceCommand => cmd.type === 'hubitat_device',
  )
  for (const cmd of hubitatCommands) {
    try {
      await hubitatClient.sendCommand(cmd.device_id, 'off')
      log(`Turned off Hubitat device ${cmd.device_id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error turning off Hubitat device: ${msg}`)
    }
  }

  // Also turn off lights assigned to rooms in this scene (batched)
  const roomLightStates: BatchState[] = []
  for (const room of rooms) {
    const lights = getAll<{ light_selector: string }>(
      'SELECT light_selector FROM light_rooms WHERE room_name = ?',
      [room.name],
    )
    for (const light of lights) {
      roomLightStates.push({
        selector: light.light_selector,
        power: 'off',
        duration: 1,
      })
    }
  }

  if (roomLightStates.length > 0) {
    try {
      // setStates supports up to 50 per call, batch if needed
      for (let i = 0; i < roomLightStates.length; i += 50) {
        const batch = roomLightStates.slice(i, i + 50)
        await lifxClient.setStates(batch)
      }
      log(`Batch turned off ${roomLightStates.length} room light(s)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error turning off room lights: ${msg}`)
    }
  }

  for (const room of rooms) {
    run(
      `UPDATE rooms SET current_scene = NULL, updated_at = datetime('now') WHERE name = ?`,
      [room.name],
    )
  }
}
