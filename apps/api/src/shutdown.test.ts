import { expect, test } from 'bun:test'

import { shutdownGracefully } from './shutdown.js'

function fakeServer(order: string[]) {
  let finishClose: () => void = () => undefined
  return {
    server: {
      close(callback: (error?: Error) => void) {
        order.push('stop accepting')
        finishClose = () => {
          order.push('in-flight done')
          callback()
        }
      },
    },
    finishInFlight: () => finishClose(),
  }
}

test('stops accepting, waits for requests in flight, then flushes and exits', async () => {
  const order: string[] = []
  const { server, finishInFlight } = fakeServer(order)

  const done = shutdownGracefully({
    server,
    flush: async () => {
      order.push('flush')
    },
    exit: (code) => order.push(`exit ${code}`),
  })
  await Promise.resolve()
  expect(order).toEqual(['stop accepting'])

  finishInFlight()
  await done
  expect(order).toEqual(['stop accepting', 'in-flight done', 'flush', 'exit 0'])
})

test('still exits when the telemetry flush fails', async () => {
  const exits: number[] = []
  await shutdownGracefully({
    server: { close: (callback: (error?: Error) => void) => callback() },
    flush: async () => {
      throw new Error('posthog down')
    },
    exit: (code) => exits.push(code),
  })
  expect(exits).toEqual([0])
})
