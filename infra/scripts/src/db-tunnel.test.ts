import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(import.meta.dir, '../db-tunnel.sh')
const DATABASE = 'allfitone-production.abc123.us-east-1.rds.amazonaws.com'

// An aws CLI on PATH that answers the lookups and records what it was asked to do.
let stub = ''
const recorded = (name: string) => readFileSync(join(stub, name), 'utf8')

beforeEach(() => {
  stub = mkdtempSync(join(tmpdir(), 'db-tunnel-'))
  writeFileSync(
    join(stub, 'aws'),
    `#!/bin/sh
case "$1" in
  sts) [ -f "${stub}/expired" ] && exit 255; exit 0 ;;
  sso) printf '%s\\n' "$@" > "${stub}/login"; rm -f "${stub}/expired" ;;
  ec2) printf '%s\\n' "$@" > "${stub}/ec2"; cat "${stub}/instance" ;;
  rds) printf '%s\\n' "${DATABASE}" ;;
  ssm)
    if [ "$2" = terminate-session ]; then printf '%s\\n' "$@" > "${stub}/terminated"; exit 0; fi
    printf '%s\\n' "$@" > "${stub}/session"
    echo session >> "${stub}/sessions"
    echo 'Starting session with SessionId: tester-0a1b2c3d4e5f.'
    # Like the real CLI, the session lives in a child: the Session Manager plugin.
    if [ -f "${stub}/hold" ]; then
      echo 'Waiting for connections...'
      sleep 30 & echo $! > "${stub}/plugin"; wait
    fi ;;
esac
`,
  )
  chmodSync(join(stub, 'aws'), 0o755)
  writeFileSync(join(stub, 'instance'), 'i-0123456789abcdef0\n')
})

afterEach(() => rmSync(stub, { recursive: true, force: true }))

// Through the shell that started them: under Git Bash, `$!` is not a Windows process id,
// and Bun's kill there ends the process outright, so no trap would ever run.
function isAlive(pid: number): boolean {
  return Bun.spawnSync(['sh', '-c', `kill -0 ${pid}`]).exitCode === 0
}

function terminate(pid: number): void {
  Bun.spawnSync(['sh', '-c', `kill -TERM ${pid}`])
}

/*
 * Whether a process is still running is not a question Windows can answer here,
 * for two reasons that are each enough on their own.
 *
 * **A backgrounded child does not outlive its launcher.** Windows closes the
 * whole tree when the root process exits, and `start` deliberately daemonises
 * the tunnel and returns — so by the time the assertion runs there is nothing
 * left to find. Verified with a `nohup sleep 30 &` behind a `Bun.spawnSync`.
 *
 * **And the pid is not the right kind of number.** `$!` in Git Bash is a
 * bash-internal pid (a small integer like 46), while `process.kill` asks the
 * Windows kernel — so `isAlive` is asking about some other process entirely.
 *
 * Skipped rather than rewritten because the behaviour is real and worth
 * asserting on the platform that runs it: CI is Linux and executes all three.
 * Leaving them to fail here is not neutral — the pre-push hook runs this suite,
 * so one red test blocked every push from a Windows machine, on any branch and
 * any product. Worse, the `toBe(false)` assertion below passed on Windows
 * *because* everything is already dead, reporting coverage that did not exist.
 */
const posixOnly = test.skipIf(process.platform === 'win32')

function tunnel(env: Record<string, string> = {}, command: string[] = []) {
  return Bun.spawnSync(['bash', SCRIPT, ...command], {
    env: { PATH: `${stub}:${process.env['PATH'] ?? ''}`, TMPDIR: stub, ...env },
  })
}

describe('db-tunnel', () => {
  test('forwards the local port to the database through the running ECS machine', () => {
    const run = tunnel()

    expect(run.exitCode).toBe(0)
    expect(recorded('ec2')).toContain(
      'Name=tag:aws:autoscaling:groupName,Values=allfitone-production-ecs',
    )
    expect(recorded('ec2')).toContain('Name=instance-state-name,Values=running')
    const session = recorded('session')
    expect(session).toContain('i-0123456789abcdef0')
    expect(session).toContain('AWS-StartPortForwardingSessionToRemoteHost')
    expect(session).toContain(`host=${DATABASE},portNumber=5432,localPortNumber=15432`)
  })

  test('signs in to AWS first when the session has expired', () => {
    writeFileSync(join(stub, 'expired'), '')

    const run = tunnel()

    expect(run.exitCode).toBe(0)
    expect(recorded('login')).toContain('login')
    expect(existsSync(join(stub, 'session'))).toBe(true)
  })

  test('stops without a session when no machine is running', () => {
    writeFileSync(join(stub, 'instance'), 'None\n')

    const run = tunnel()

    expect(run.exitCode).not.toBe(0)
    expect(existsSync(join(stub, 'session'))).toBe(false)
  })

  posixOnly('stopping the tunnel also stops the plugin that holds the port', async () => {
    writeFileSync(join(stub, 'hold'), '')
    const run = Bun.spawn(
      ['bash', '-c', 'bash "$0" & echo $! > "$1"; wait', SCRIPT, join(stub, 'run')],
      {
        env: { PATH: `${stub}:${process.env['PATH'] ?? ''}` },
      },
    )
    while (!existsSync(join(stub, 'plugin'))) await Bun.sleep(20)
    const plugin = Number(recorded('plugin').trim())

    terminate(Number(recorded('run').trim()))
    await run.exited
    await Bun.sleep(200)

    expect(isAlive(plugin)).toBe(false)
  })

  posixOnly('start returns once the tunnel is ready and leaves it open until stop', async () => {
    writeFileSync(join(stub, 'hold'), '')

    const start = tunnel({}, ['start'])

    expect(start.exitCode).toBe(0)
    const plugin = Number(recorded('plugin').trim())
    expect(isAlive(plugin)).toBe(true)

    expect(tunnel({}, ['stop']).exitCode).toBe(0)
    await Bun.sleep(300)
    expect(isAlive(plugin)).toBe(false)
  })

  test('stop also closes the session in AWS, which outlives a stopped plugin', async () => {
    writeFileSync(join(stub, 'hold'), '')

    tunnel({}, ['start'])
    tunnel({}, ['stop'])
    while (!existsSync(join(stub, 'terminated'))) await Bun.sleep(20)

    expect(recorded('terminated')).toContain('tester-0a1b2c3d4e5f')
  })

  test('start reuses a tunnel that is already open', async () => {
    writeFileSync(join(stub, 'hold'), '')

    tunnel({}, ['start'])
    tunnel({}, ['start'])

    expect(recorded('sessions').trim().split('\n')).toHaveLength(1)
    tunnel({}, ['stop'])
    await Bun.sleep(300)
  })

  test('start fails when the tunnel cannot open', () => {
    writeFileSync(join(stub, 'instance'), 'None\n')

    const start = tunnel({}, ['start'])

    expect(start.exitCode).not.toBe(0)
  })

  test('takes another local port when asked', () => {
    tunnel({ LOCAL_PORT: '25432' })

    expect(recorded('session')).toContain('localPortNumber=25432')
  })
})
