/**
 * Runs the worker's batch on a fixed interval inside a long-lived container.
 *
 * On Vercel an external cron woke the worker every minute. In a container
 * nothing calls it, so it keeps its own clock. The next wait only starts once
 * the previous run has finished, which is what rules out two batches at once
 * without any locking here (the queue's SKIP LOCKED covers other replicas).
 *
 * `stop` is for SIGTERM: it cancels the wait, lets the run in flight finish and
 * starts nothing new, so a deploy never cuts a batch in half.
 */

export type Wait = (ms: number, signal: AbortSignal) => Promise<void>

export interface SchedulerOptions {
  intervalMs: number
  run: () => Promise<void>
  wait?: Wait
  onError?: (error: unknown) => void
}

export interface Scheduler {
  start(): void
  stop(): Promise<void>
  running(): boolean
}

const realWait: Wait = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })

export function createScheduler(options: SchedulerOptions): Scheduler {
  const wait = options.wait ?? realWait
  const onError = options.onError ?? (() => undefined)
  let controller: AbortController | undefined
  let loop: Promise<void> | undefined

  async function cycle(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await options.run()
      } catch (error) {
        onError(error)
      }
      if (signal.aborted) return
      await wait(options.intervalMs, signal)
    }
  }

  return {
    start() {
      if (loop) return
      controller = new AbortController()
      loop = cycle(controller.signal)
    },
    async stop() {
      controller?.abort()
      await loop
      loop = undefined
      controller = undefined
    },
    running: () => loop !== undefined,
  }
}
