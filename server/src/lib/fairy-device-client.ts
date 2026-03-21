/**
 * Fairy device (custom HTTP-based WiFi lights) client
 * These are ESP8266/ESP32-based lights controlled via HTTP
 */
import axios from 'axios'

interface FairyCommand {
  r?: number
  g?: number
  b?: number
  bright?: number
  speed?: number
  repeat?: number
  kind?: string
}

export const fairyDeviceClient = {
  /**
   * Send a command to a fairy device
   * @param ipAddress - Device IP address
   * @param command - Command object with RGB, brightness, pattern params
   */
  async sendCommand(ipAddress: string, command: FairyCommand) {
    try {
      const res = await axios.post(`http://${ipAddress}/command`, command, {
        timeout: 5000,
      })
      return res.data
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Fairy device at ${ipAddress} error: ${msg}`)
    }
  },

  /**
   * Turn off a fairy device
   */
  async turnOff(ipAddress: string) {
    return this.sendCommand(ipAddress, { bright: 0 })
  },

  /**
   * Set brightness (0-255)
   */
  async setBrightness(ipAddress: string, brightness: number) {
    return this.sendCommand(ipAddress, {
      bright: Math.max(0, Math.min(255, Math.round(brightness))),
    })
  },

  /**
   * Set colour and brightness
   */
  async setColor(
    ipAddress: string,
    r: number,
    g: number,
    b: number,
    brightness: number,
  ) {
    return this.sendCommand(ipAddress, {
      r: Math.max(0, Math.min(255, r)),
      g: Math.max(0, Math.min(255, g)),
      b: Math.max(0, Math.min(255, b)),
      bright: Math.max(0, Math.min(255, Math.round(brightness))),
    })
  },

  /**
   * Run a named pattern/command
   * @param ipAddress - Device IP
   * @param commandName - Pre-configured command name (looked up from fairy_commands collection)
   * @param commandData - The command data object
   */
  async runNamedCommand(ipAddress: string, commandData: FairyCommand) {
    return this.sendCommand(ipAddress, commandData)
  },

  /**
   * Get device status (if supported)
   */
  async getStatus(ipAddress: string) {
    try {
      const res = await axios.get(`http://${ipAddress}/status`, {
        timeout: 3000,
      })
      return res.data
    } catch {
      return { status: 'unknown' }
    }
  },
}
