import { randomUUID } from 'crypto'

export interface SceneTimer {
  id: string
  sceneName: string
  targetScene: string
  durationMs: number
  startedAt: number
  timeout: NodeJS.Timeout
}

class TimerManager {
  private timers: Map<string, SceneTimer> = new Map()

  createTimer(
    sceneName: string,
    targetScene: string,
    durationSeconds: number,
  ): string {
    const id = randomUUID()
    const durationMs = durationSeconds * 1000

    const timeout = setTimeout(() => {
      this.timers.delete(id)
      console.log(
        `Timer ${id} expired: ${sceneName} -> ${targetScene}`,
      )
      // The scene executor should hook into this via onExpire if needed
    }, durationMs)

    // Prevent timer from keeping the process alive
    timeout.unref()

    const timer: SceneTimer = {
      id,
      sceneName,
      targetScene,
      durationMs,
      startedAt: Date.now(),
      timeout,
    }

    this.timers.set(id, timer)
    return id
  }

  cancelTimer(id: string): boolean {
    const timer = this.timers.get(id)
    if (!timer) return false
    clearTimeout(timer.timeout)
    this.timers.delete(id)
    return true
  }

  getStatus(): Omit<SceneTimer, 'timeout'>[] {
    return Array.from(this.timers.values()).map(
      ({ timeout: _timeout, ...rest }) => rest,
    )
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer.timeout)
    }
    this.timers.clear()
  }
}

export const timerManager = new TimerManager()
