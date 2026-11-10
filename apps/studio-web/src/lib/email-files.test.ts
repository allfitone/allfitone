/**
 * The files under public/email are loaded by emails, and an inbox keeps each one by its
 * URL for as long as it likes: Gmail and Outlook fetch it once through their own proxies
 * and ignore our cache headers. So a file whose name carries a content hash must never
 * change in place; a new version is a new name (`EMAIL_FILES` in @allfitone/notifications).
 */

import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EMAIL_DIRECTORY = fileURLToPath(new URL('../../public/email/', import.meta.url))
const HASHED = /\.([0-9a-f]{8})\.[a-z0-9]+$/

function hashedFiles(): { path: string; hash: string }[] {
  return readdirSync(EMAIL_DIRECTORY, { recursive: true, encoding: 'utf8' }).flatMap((path) => {
    const match = HASHED.exec(path)
    return match?.[1] ? [{ path, hash: match[1] }] : []
  })
}

describe('email files', () => {
  test('a hashed file still holds the content its name promises', () => {
    const files = hashedFiles()

    expect(files.length).toBeGreaterThanOrEqual(3)
    for (const { path, hash } of files) {
      const content = readFileSync(`${EMAIL_DIRECTORY}/${path}`)
      expect({
        path,
        hash: createHash('sha256').update(content).digest('hex').slice(0, 8),
      }).toEqual({
        path,
        hash,
      })
    }
  })
})
