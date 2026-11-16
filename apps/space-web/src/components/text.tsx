import type { ReactNode } from 'react'

/** Splits «text {key} text» around one placeholder, so the middle can be markup. */
export function around(text: string, key: string, middle: ReactNode): ReactNode {
  const [before = '', after = ''] = text.split(`{${key}}`)
  return (
    <>
      {before}
      {middle}
      {after}
    </>
  )
}
