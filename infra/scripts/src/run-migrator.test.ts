import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(import.meta.dir, '../run-migrator.sh')

// An aws CLI on PATH that starts nothing and records the task it was asked to run. The
// jq beside it prints nothing, which the log loop reads as a single empty page.
let stub = ''

beforeEach(() => {
  stub = mkdtempSync(join(tmpdir(), 'run-migrator-'))
  writeFileSync(
    join(stub, 'aws'),
    `#!/bin/sh
case "$1 $2" in
  'ecs run-task')
    while [ $# -gt 0 ]; do
      if [ "$1" = --overrides ]; then printf '%s' "$2" > "${stub}/overrides"; fi
      shift
    done
    echo arn:aws:ecs:us-east-1:000000000000:task/allfitone-production/0a1b2c3d ;;
  'ecs describe-tasks') echo 0 ;;
  'logs get-log-events') echo '{}' ;;
esac
`,
  )
  writeFileSync(join(stub, 'jq'), '#!/bin/sh\ncat > /dev/null\n')
  chmodSync(join(stub, 'aws'), 0o755)
  chmodSync(join(stub, 'jq'), 0o755)
})

afterEach(() => rmSync(stub, { recursive: true, force: true }))

function run(command: string, input: Record<string, string> = {}) {
  return Bun.spawnSync(['bash', SCRIPT, command], {
    env: {
      PATH: `${stub}:${process.env['PATH'] ?? ''}`,
      CLUSTER: 'allfitone-production',
      FAMILY: 'allfitone-production-migrator',
      LOG_GROUP: '/allfitone-production/migrator',
      ...input,
    },
  })
}

interface Overrides {
  containerOverrides: {
    name: string
    command: string[]
    environment: { name: string; value: string }[]
  }[]
}

function overrides(): Overrides['containerOverrides'][number] | undefined {
  const sent = JSON.parse(readFileSync(join(stub, 'overrides'), 'utf8')) as Overrides
  return sent.containerOverrides[0]
}

describe('run-migrator', () => {
  test('starts the curation with the script numbers it was narrowed to', () => {
    const task = run('curate', { CURATION_ONLY: '001 003' })

    expect(task.exitCode).toBe(0)
    expect(overrides()?.command).toEqual(['curate'])
    expect(overrides()?.environment).toContainEqual({ name: 'CURATION_ONLY', value: '001 003' })
  })

  test('leaves the list empty when nothing narrows the run, which runs every script', () => {
    run('curate')

    expect(overrides()?.environment).toContainEqual({ name: 'CURATION_ONLY', value: '' })
  })

  test('refuses anything that is not a list of numbers before starting a task', () => {
    // The value is spliced into the JSON the task receives.
    const task = run('curate', { CURATION_ONLY: '001","x":"' })

    expect(task.exitCode).not.toBe(0)
    expect(existsSync(join(stub, 'overrides'))).toBe(false)
  })

  test('still carries the migration decision a push needs', () => {
    run('push', { INCLUDE_ALL: 'true' })

    expect(overrides()?.command).toEqual(['push'])
    expect(overrides()?.environment).toContainEqual({ name: 'INCLUDE_ALL', value: 'true' })
  })
})
