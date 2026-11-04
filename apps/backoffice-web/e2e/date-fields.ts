import type { Locator } from '@playwright/test'

/** The day `offset` days from now as an operator types it: DD/MM/AAAA, in local time. */
export function typedDay(offset: number): string {
  const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

/** Types into a Design System date or time field and commits it, as Enter does. */
export async function typeInto(field: Locator, value: string): Promise<void> {
  await field.fill(value)
  await field.press('Enter')
}
