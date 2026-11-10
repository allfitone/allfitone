'use client'

/**
 * Holds a value back until it stops changing.
 *
 * A search box that asks on every keystroke sends one request per letter, and
 * the answers arrive out of order — the directory would flicker through the
 * results of half-typed names. Waiting for the typing to settle asks once.
 *
 * It is a delay, not a cancellation: the caller still passes the settled value
 * to a query that aborts its own in-flight request through its signal.
 */
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    if (Object.is(value, settled)) return
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, settled, delayMs])

  return settled
}
