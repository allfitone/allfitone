import { expect, test } from 'bun:test'

import { createScheduler, type Wait } from './scheduler.js'

/** A wait the test releases by hand, so time never decides the outcome. */
function manualWait(): { wait: Wait; pending: () => number; release: () => void } {
  const resolvers: (() => void)[] = []
  return {
    wait: (_ms, signal) =>
      new Promise<void>((resolve) => {
        resolvers.push(resolve)
        signal.addEventListener('abort', () => resolve(), { once: true })
      }),
    pending: () => resolvers.length,
    release: () => resolvers.shift()?.(),
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('runs once on start and again after each interval', async () => {
  const clock = manualWait()
  let runs = 0
  const scheduler = createScheduler({
    intervalMs: 15_000,
    run: async () => {
      runs += 1
    },
    wait: clock.wait,
  })

  scheduler.start()
  await tick()
  expect(runs).toBe(1)

  clock.release()
  await tick()
  expect(runs).toBe(2)

  await scheduler.stop()
})

test('waits the configured interval between runs', async () => {
  const asked: number[] = []
  const scheduler = createScheduler({
    intervalMs: 15_000,
    run: async () => undefined,
    wait: (ms, signal) => {
      asked.push(ms)
      return new Promise((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      )
    },
  })

  scheduler.start()
  await tick()
  expect(asked).toEqual([15_000])

  await scheduler.stop()
})

test('never starts a run while the previous one is still going', async () => {
  const clock = manualWait()
  let runs = 0
  let finish: () => void = () => undefined
  const scheduler = createScheduler({
    intervalMs: 15_000,
    run: () => {
      runs += 1
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    },
    wait: clock.wait,
  })

  scheduler.start()
  await tick()
  clock.release()
  clock.release()
  await tick()
  expect(runs).toBe(1)
  expect(clock.pending()).toBe(0)

  finish()
  await tick()
  expect(clock.pending()).toBe(1)

  const stopped = scheduler.stop()
  await stopped
})

test('keeps going after a run fails and reports the failure', async () => {
  const clock = manualWait()
  const failures: unknown[] = []
  let runs = 0
  const scheduler = createScheduler({
    intervalMs: 15_000,
    run: async () => {
      runs += 1
      if (runs === 1) throw new Error('resend down')
    },
    wait: clock.wait,
    onError: (error) => failures.push(error),
  })

  scheduler.start()
  await tick()
  expect(failures).toHaveLength(1)

  clock.release()
  await tick()
  expect(runs).toBe(2)

  await scheduler.stop()
})

test('stop lets the run in flight finish and starts no other', async () => {
  const clock = manualWait()
  let runs = 0
  let finish: () => void = () => undefined
  let finished = false
  const scheduler = createScheduler({
    intervalMs: 15_000,
    run: () => {
      runs += 1
      return new Promise<void>((resolve) => {
        finish = () => {
          finished = true
          resolve()
        }
      })
    },
    wait: clock.wait,
  })

  scheduler.start()
  await tick()

  let stopResolved = false
  const stopped = scheduler.stop().then(() => {
    stopResolved = true
  })
  await tick()
  expect(stopResolved).toBeFalse()

  finish()
  await stopped
  expect(finished).toBeTrue()
  expect(runs).toBe(1)
  expect(scheduler.running()).toBeFalse()
})

test('reports whether it is running, for the health check', async () => {
  const clock = manualWait()
  const scheduler = createScheduler({
    intervalMs: 15_000,
    run: async () => undefined,
    wait: clock.wait,
  })

  expect(scheduler.running()).toBeFalse()
  scheduler.start()
  expect(scheduler.running()).toBeTrue()
  await scheduler.stop()
  expect(scheduler.running()).toBeFalse()
})
