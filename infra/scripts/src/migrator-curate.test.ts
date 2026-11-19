import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const MIGRATOR = resolve(import.meta.dir, '../../docker/migrator.sh')
const DOCKERFILE = resolve(import.meta.dir, '../../docker/migrator.Dockerfile')

// A psql on PATH that records every call instead of reaching a database, and fails on the
// script named in `fail`.
let stub = ''
let curation = ''

beforeEach(() => {
  stub = mkdtempSync(join(tmpdir(), 'migrator-curate-'))
  curation = join(stub, 'curation')
  mkdirSync(curation)
  writeFileSync(
    join(stub, 'psql'),
    `#!/bin/sh
printf '%s\\n' "$*" >> "${stub}/calls"
if [ -f "${stub}/fail" ]; then
  case "$*" in *"$(cat "${stub}/fail")"*) exit 3 ;; esac
fi
`,
  )
  chmodSync(join(stub, 'psql'), 0o755)
  carry(['001_first.sql', '003_third.sql', '002_second.sql'])
})

afterEach(() => rmSync(stub, { recursive: true, force: true }))

/** What the image holds: the order, and the scripts that came with it. */
function carry(order: string[], present: string[] = order) {
  writeFileSync(join(curation, 'RUN_ORDER'), `# a comment\n\n${order.join('\n')}\n`)
  for (const name of present) writeFileSync(join(curation, name), 'select 1;\n')
}

function curate(input: Record<string, string> = {}) {
  return Bun.spawnSync(['sh', MIGRATOR, 'curate'], {
    env: {
      PATH: `${stub}:${process.env['PATH'] ?? ''}`,
      DB_HOST: 'db.internal',
      DB_PORT: '5432',
      DB_NAME: 'allfitone',
      DB_MASTER_USERNAME: 'dbmaster',
      DB_MASTER_PASSWORD: 'secret',
      CURATION_DIR: curation,
      ...input,
    },
  })
}

function calls(): string[] {
  if (!existsSync(join(stub, 'calls'))) return []
  return readFileSync(join(stub, 'calls'), 'utf8').trim().split('\n')
}

/** The script each psql call was handed, in the order the calls happened. */
function scriptsRun(): string[] {
  return calls().map((call) => /(\d{3}_\w+\.sql)/.exec(call)?.[1] ?? call)
}

describe('migrate curate', () => {
  test('runs every script once, in the listed order and not by number', () => {
    const run = curate()

    expect(run.exitCode).toBe(0)
    expect(scriptsRun()).toEqual(['001_first.sql', '003_third.sql', '002_second.sql'])
  })

  test('reaches the database as the master and stops a script at its first error', () => {
    curate()

    const [call] = calls()
    expect(call).toContain(
      'postgresql://dbmaster:secret@db.internal:5432/allfitone?sslmode=require',
    )
    expect(call).toContain('ON_ERROR_STOP=1')
  })

  test('stops at the script that fails and leaves the ones after it unrun', () => {
    writeFileSync(join(stub, 'fail'), '003_third.sql')

    const run = curate()

    expect(run.exitCode).not.toBe(0)
    expect(scriptsRun()).toEqual(['001_first.sql', '003_third.sql'])
  })

  test('runs only the numbers asked for, still in the listed order', () => {
    const run = curate({ CURATION_ONLY: '002 001' })

    expect(run.exitCode).toBe(0)
    expect(scriptsRun()).toEqual(['001_first.sql', '002_second.sql'])
  })

  test('refuses a number that names no script before running anything', () => {
    const run = curate({ CURATION_ONLY: '001 009' })

    expect(run.exitCode).not.toBe(0)
    expect(run.stderr.toString()).toContain('009')
    expect(scriptsRun()).toEqual([])
  })

  test('refuses to start when a listed script did not come with the image', () => {
    carry(['001_first.sql', '004_missing.sql'], ['001_first.sql'])

    const run = curate()

    expect(run.exitCode).not.toBe(0)
    expect(run.stderr.toString()).toContain('004_missing.sql')
    expect(scriptsRun()).toEqual([])
  })

  test('the image carries the scripts the command reads', () => {
    expect(readFileSync(DOCKERFILE, 'utf8')).toContain('packages/db/curation')
  })
})
