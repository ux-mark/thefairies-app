/**
 * Twinkly lights API client
 * Twinkly uses a local HTTP API with token-based auth
 * Docs: https://xled-docs.readthedocs.io/
 */
import axios, { AxiosInstance } from 'axios'

interface TwinklyAuth {
  token: string
  expiresAt: number
}

const authCache = new Map<string, TwinklyAuth>()

async function getAuthenticatedClient(ipAddress: string): Promise<AxiosInstance> {
  const cached = authCache.get(ipAddress)
  if (cached && cached.expiresAt > Date.now()) {
    return axios.create({
      baseURL: `http://${ipAddress}/xled/v1`,
      timeout: 5000,
      headers: { 'X-Auth-Token': cached.token },
    })
  }

  // Authenticate: POST /xled/v1/login
  const loginRes = await axios.post(`http://${ipAddress}/xled/v1/login`, {
    challenge: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  })

  const token = loginRes.data.authentication_token
  const tokenExpiry = (loginRes.data.authentication_token_expires_in || 14400) * 1000

  // Verify token
  await axios.post(
    `http://${ipAddress}/xled/v1/verify`,
    { challenge: loginRes.data.challenge_response },
    { headers: { 'X-Auth-Token': token } },
  )

  authCache.set(ipAddress, {
    token,
    expiresAt: Date.now() + tokenExpiry - 60000, // 1 min buffer
  })

  return axios.create({
    baseURL: `http://${ipAddress}/xled/v1`,
    timeout: 5000,
    headers: { 'X-Auth-Token': token },
  })
}

export const twinklyClient = {
  /**
   * Get device info
   */
  async getDeviceInfo(ipAddress: string) {
    const client = await getAuthenticatedClient(ipAddress)
    const res = await client.get('/gestalt')
    return res.data
  },

  /**
   * Set LED mode: off, movie, demo, effect
   */
  async setMode(ipAddress: string, mode: 'off' | 'movie' | 'demo' | 'effect') {
    const client = await getAuthenticatedClient(ipAddress)
    const modeMap: Record<string, string> = {
      off: 'off',
      movie: 'movie',
      demo: 'demo',
      effect: 'effect',
    }
    const res = await client.post('/led/mode', { mode: modeMap[mode] || 'off' })
    return res.data
  },

  /**
   * Get current mode
   */
  async getMode(ipAddress: string) {
    const client = await getAuthenticatedClient(ipAddress)
    const res = await client.get('/led/mode')
    return res.data
  },

  /**
   * Set brightness (0-100)
   */
  async setBrightness(ipAddress: string, brightness: number) {
    const client = await getAuthenticatedClient(ipAddress)
    const value = Math.max(0, Math.min(100, Math.round(brightness)))
    const res = await client.post('/led/out/brightness', {
      mode: 'enabled',
      type: 'A',
      value,
    })
    return res.data
  },

  /**
   * Turn on (set to movie mode)
   */
  async turnOn(ipAddress: string) {
    return this.setMode(ipAddress, 'movie')
  },

  /**
   * Turn off
   */
  async turnOff(ipAddress: string) {
    return this.setMode(ipAddress, 'off')
  },
}
