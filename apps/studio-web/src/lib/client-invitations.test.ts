import { describe, expect, test } from 'bun:test'

import { canInviteClients, invitationBody, toggleScope, validateDraft } from './client-invitations'
import type { OfferableScope, OrganizationRole } from './studio-api'

function role(code: string, capabilities: string[]): OrganizationRole {
  return {
    code,
    name: code,
    capabilities: capabilities.map((capability) => ({ code: capability, name: capability })),
    fitness_data_access_policy: 'not_granted_by_role',
  } as OrganizationRole
}

const OWNER = role('owner', ['invite_clients', 'view_directory'])
const STAFF = role('staff', ['view_directory'])

function scope(code: string, name: string): OfferableScope {
  return {
    scope_definition_id: `0199f000-0000-7000-8000-00000000000${code.length % 10}`,
    scope_code: code,
    version_number: 1,
    display_name: name,
    description: `Qué cubre ${name}. No incluye otras cosas.`,
    default_purpose: `Por qué pedimos ${name}.`,
  } as OfferableScope
}

const CATALOG: OfferableScope[] = [
  scope('relationship_training', 'Entrenamiento con nosotros'),
  scope('body_progress', 'Progreso corporal'),
  scope('health_context', 'Contexto de salud'),
]

describe('who may invite', () => {
  test('a role carrying the capability may', () => {
    expect(canInviteClients(['owner'], [OWNER])).toBe(true)
  })

  test('a role that only reads the directory may not', () => {
    expect(canInviteClients(['staff'], [STAFF])).toBe(false)
  })

  test('nobody may while the catalog is still unknown', () => {
    expect(canInviteClients(['owner'], undefined)).toBe(false)
  })
})

describe('what the form refuses to send', () => {
  test('an empty address', () => {
    expect(validateDraft({ contact: '  ', scopeCodes: ['body_progress'] }).contact).toBeTruthy()
  })

  test('something that is not an address', () => {
    expect(validateDraft({ contact: 'ana', scopeCodes: ['body_progress'] }).contact).toBeTruthy()
  })

  /*
   * An invitation asking for nothing would create a relationship that grants
   * access to nothing — which is a legitimate *outcome* of someone declining,
   * but never a legitimate thing to send.
   */
  test('an invitation that asks for nothing', () => {
    expect(validateDraft({ contact: 'ana@example.test', scopeCodes: [] }).scopes).toBeTruthy()
  })

  test('and accepts a complete draft', () => {
    expect(validateDraft({ contact: 'ana@example.test', scopeCodes: ['body_progress'] })).toEqual(
      {},
    )
  })
})

describe('the body it builds', () => {
  const draft = { contact: '  Ana@Example.test ', scopeCodes: ['body_progress'] }

  test('lower-cases and trims the address', () => {
    expect(invitationBody(draft, CATALOG).contact).toBe('ana@example.test')
  })

  test('sends only the scopes that were ticked', () => {
    const body = invitationBody(draft, CATALOG)
    expect(body.scopes).toHaveLength(1)
    expect(body.scopes[0]?.scope_code).toBe('body_progress')
  })

  /*
   * The glossary is explicit that three of the seven never admit professional
   * writing, and the rest take `contribute` only on a further explicit
   * acceptance. The form never offers the choice, so this is the assertion that
   * keeps it that way.
   *
   * A proposed program is the single exception, and it is not a choice of
   * level: see 'the body it builds with a program' below. The name of this test
   * says «with no program» for that reason — the assertion itself is unchanged.
   */
  test('asks to read and never to write, with no program proposed', () => {
    const everything = { contact: 'ana@example.test', scopeCodes: CATALOG.map((s) => s.scope_code) }
    const body = invitationBody(everything, CATALOG)
    expect(body.scopes.every((entry) => entry.access_level === 'read')).toBe(true)
  })

  test('takes the purpose from the catalogue, never from the screen', () => {
    const body = invitationBody(draft, CATALOG)
    expect(body.scopes[0]?.purpose).toBe('Por qué pedimos Progreso corporal.')
  })

  test('freezes what the person will read into the snapshot', () => {
    const snapshot = invitationBody(draft, CATALOG).scopes[0]?.presented_snapshot
    expect(snapshot).toMatchObject({
      display_name: 'Progreso corporal',
      version_number: 1,
    })
  })

  test('a code nobody offers cannot be smuggled in', () => {
    const body = invitationBody({ contact: 'ana@example.test', scopeCodes: ['invented'] }, CATALOG)
    expect(body.scopes).toEqual([])
  })
})

/*
 * Criteria 2, 6 and 7. The body builder owns the invariant rather than the
 * component, because a program without `relationship_training` at `contribute`
 * is a `22023` whose field the API drops — the screen would get a refusal it
 * cannot point at anything.
 */
describe('the body it builds with a program', () => {
  const PROGRAM = { versionId: '018f-v2', startsOn: '2026-11-09' }
  const draft = {
    contact: 'ana@example.test',
    scopeCodes: ['relationship_training', 'body_progress'],
    program: PROGRAM,
  }

  test('raises only the training scope to contribute', () => {
    const body = invitationBody(draft, CATALOG, 'America/Bogota')
    const levels = Object.fromEntries(
      body.scopes.map((entry) => [entry.scope_code, entry.access_level]),
    )
    expect(levels['relationship_training']).toBe('contribute')
    expect(levels['body_progress']).toBe('read')
  })

  test('carries the version, the start and the zone — all three or none', () => {
    expect(invitationBody(draft, CATALOG, 'America/Bogota').program).toEqual({
      program_version_id: '018f-v2',
      starts_on: '2026-11-09',
      timezone: 'America/Bogota',
    })
  })

  test('and sends no program key at all when none is chosen', () => {
    const body = invitationBody(
      { contact: 'ana@example.test', scopeCodes: ['body_progress'] },
      CATALOG,
      'America/Bogota',
    )
    expect('program' in body).toBe(false)
  })

  /*
   * The same scope stays at `read` when the program is dropped, so un-choosing
   * a program cannot leave a write request behind in the body.
   */
  test('dropping the program puts the training scope back to read', () => {
    const body = invitationBody(
      { ...draft, program: { versionId: '', startsOn: '2026-11-09' } },
      CATALOG,
      'America/Bogota',
    )
    expect(body.scopes.every((entry) => entry.access_level === 'read')).toBe(true)
    expect('program' in body).toBe(false)
  })

  test('the draft is refused when the program has no training scope ticked', () => {
    const errors = validateDraft({
      contact: 'ana@example.test',
      scopeCodes: ['body_progress'],
      program: PROGRAM,
    })
    expect(errors.scopes).toContain('permiso de entrenamiento')
  })

  test('and accepted when it does', () => {
    expect(validateDraft(draft)).toEqual({})
  })
})

describe('ticking scopes', () => {
  test('adds one', () => {
    expect(toggleScope([], 'body_progress', CATALOG)).toEqual(['body_progress'])
  })

  test('removes one already ticked', () => {
    expect(toggleScope(['body_progress'], 'body_progress', CATALOG)).toEqual([])
  })

  /*
   * Catalogue order, not click order. The invitation records the scopes in the
   * order they are sent, and two professionals ticking the same three boxes in
   * different orders should produce the same offer — otherwise the reuse check
   * in the command sees two different proposals.
   */
  test('keeps catalogue order whatever order they were ticked', () => {
    let chosen = toggleScope([], 'health_context', CATALOG)
    chosen = toggleScope(chosen, 'relationship_training', CATALOG)
    expect(chosen).toEqual(['relationship_training', 'health_context'])
  })
})
