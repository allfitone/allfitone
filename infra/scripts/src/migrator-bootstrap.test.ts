import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const MIGRATOR = resolve(import.meta.dir, '../../docker/migrator.sh')

// A psql on PATH that records what the migrator hands it, instead of a database.
let stubDirectory = ''
const recorded = (name: string) => readFileSync(join(stubDirectory, name), 'utf8')

beforeEach(() => {
  stubDirectory = mkdtempSync(join(tmpdir(), 'migrator-'))
  const psql = join(stubDirectory, 'psql')
  writeFileSync(
    psql,
    `#!/bin/sh\nprintf '%s\\n' "$@" > "${stubDirectory}/args"\ncat > "${stubDirectory}/stdin"\n`,
  )
  chmodSync(psql, 0o755)
})

afterEach(() => rmSync(stubDirectory, { recursive: true, force: true }))

const ceremony = {
  SUBJECT_A: 'user_01AAAAAAAAAAAAAAAAAAAAAAAA',
  SUBJECT_B: 'user_01BBBBBBBBBBBBBBBBBBBBBBBB',
  CEREMONY_REFERENCE: 'TECH-41',
}

function bootstrap(input: Record<string, string>) {
  return Bun.spawnSync(['sh', MIGRATOR, 'bootstrap'], {
    env: {
      PATH: `${stubDirectory}:${process.env['PATH'] ?? ''}`,
      DB_HOST: 'db.internal',
      DB_PORT: '5432',
      DB_NAME: 'allfitone',
      DB_MASTER_USERNAME: 'dbmaster',
      DB_MASTER_PASSWORD: 'secret',
      ...input,
    },
  })
}

describe('migrate bootstrap', () => {
  test('runs the ceremony as allfit_migrator with the inputs as psql variables', () => {
    const run = bootstrap(ceremony)

    expect(run.exitCode).toBe(0)
    const args = recorded('args')
    expect(args).toContain(`subject_a=${ceremony.SUBJECT_A}`)
    expect(args).toContain(`subject_b=${ceremony.SUBJECT_B}`)
    expect(args).not.toContain('duty_days')
    expect(args).toContain('ceremony=TECH-41')
    expect(args).toContain('ON_ERROR_STOP=1')

    const sql = recorded('stdin')
    expect(sql).toContain('set local role allfit_migrator')
    expect(sql).toContain('support.bootstrap_backoffice_administrators')
    // Inputs reach SQL only as quoted psql variables, never spliced into the text.
    expect(sql).not.toContain(ceremony.SUBJECT_A)
  })

  test('refuses to start without both administrators and a ceremony reference', () => {
    for (const missing of ['SUBJECT_A', 'SUBJECT_B', 'CEREMONY_REFERENCE']) {
      const input: Record<string, string> = { ...ceremony }
      delete input[missing]
      const run = bootstrap(input)

      expect(run.exitCode).not.toBe(0)
      expect(existsSync(join(stubDirectory, 'args'))).toBe(false)
    }
  })

  test('grants only the roles: the role brings duties with no end of their own (ADR-046)', () => {
    // A DUTY_DAYS left in an old runbook neither bounds nor blocks the ceremony.
    const run = bootstrap({ ...ceremony, DUTY_DAYS: '91' })

    expect(run.exitCode).toBe(0)
    expect(recorded('args')).not.toContain('duty_days')
    expect(recorded('stdin')).not.toContain('make_interval')
  })
})
