import { describe, expect, test } from 'bun:test'

import {
  canSearchWithin,
  canViewClientDirectory,
  clientEntryPath,
  clientFilterFromQuery,
  clientInitials,
  directoryEntryId,
  directoryEntryLabel,
  normalizeSearchTerm,
  searchTermState,
  searchTermToSend,
  seesEveryClient,
} from './client-directory'
import type {
  ClientDirectoryItem,
  ClientDirectoryRelationship,
  OrganizationRole,
} from './studio-api'

function role(code: string, capabilities: string[]): OrganizationRole {
  return {
    code,
    name: code,
    capabilities: capabilities.map((capability) => ({ code: capability, name: capability })),
    fitness_data_access_policy: 'not_granted_by_role',
  } as OrganizationRole
}

const STAFF = role('staff', ['view_directory'])
const COACH = role('coach', ['view_assigned_directory'])
const BILLING = role('billing', ['manage_billing'])

const RELATIONSHIP = {
  kind: 'relationship',
  relationship_id: '019ad000-0000-7000-8000-000000000301',
  person_id: '019ad000-0000-7000-8000-000000000001',
  display_name: 'Ana Alvarez',
  relationship_status: 'active',
  invitation_status: 'accepted',
  started_at: '2026-01-10T14:02:11.000Z',
  ended_at: null,
} as ClientDirectoryItem

const INVITATION = {
  kind: 'invitation',
  invitation_id: '019ad000-0000-7000-8000-000000000501',
  contact_hint: 'b***@example.test',
  invitation_status: 'pending',
  invited_at: '2026-02-01T09:00:00.000Z',
} as ClientDirectoryItem

describe('who may open the directory', () => {
  test('the catalog decides, not a list of role codes written here', () => {
    expect(canViewClientDirectory(['staff'], [STAFF])).toBe(true)
  })

  test('a coach may open it too: seeing less is still seeing a directory', () => {
    expect(canViewClientDirectory(['coach'], [COACH])).toBe(true)
  })

  test('a role with neither capability may not', () => {
    expect(canViewClientDirectory(['billing'], [BILLING])).toBe(false)
  })

  /*
   * Fail closed. An empty catalog means the answer has not arrived, and
   * assuming permission while waiting would flash a directory the caller may
   * not be allowed to see.
   */
  test('nobody may, while the catalog is still unknown', () => {
    expect(canViewClientDirectory(['staff'], undefined)).toBe(false)
    expect(canViewClientDirectory(['staff'], [])).toBe(false)
  })

  test('a role the catalog does not define grants nothing', () => {
    expect(canViewClientDirectory(['ghost'], [STAFF, COACH])).toBe(false)
  })
})

describe('who sees the whole organization', () => {
  test('staff does', () => {
    expect(seesEveryClient(['staff'], [STAFF])).toBe(true)
  })

  test('a coach does not, which is why the screen words itself differently', () => {
    expect(seesEveryClient(['coach'], [COACH])).toBe(false)
  })

  test('holding both, the wider one wins', () => {
    expect(seesEveryClient(['coach', 'staff'], [COACH, STAFF])).toBe(true)
  })
})

describe('how an entry is identified and labelled', () => {
  test('a relationship is keyed by its relationship id', () => {
    expect(directoryEntryId(RELATIONSHIP)).toBe('019ad000-0000-7000-8000-000000000301')
  })

  test('an invitation is keyed by its invitation id', () => {
    expect(directoryEntryId(INVITATION)).toBe('019ad000-0000-7000-8000-000000000501')
  })

  test('a person is labelled by name', () => {
    expect(directoryEntryLabel(RELATIONSHIP)).toBe('Ana Alvarez')
  })

  test('an invitation is labelled by the masked contact, because it has no name', () => {
    expect(directoryEntryLabel(INVITATION)).toBe('b***@example.test')
  })
})

describe('initials', () => {
  test('takes the first letter of the first two words', () => {
    expect(clientInitials('Ana Alvarez')).toBe('AA')
  })

  test('ignores extra words rather than growing', () => {
    expect(clientInitials('Ana Maria Alvarez Castro')).toBe('AM')
  })

  test('survives a single name', () => {
    expect(clientInitials('Ana')).toBe('A')
  })
})

/*
 * These mirror `parseSearch` in the route (apps/api, relationships/handlers).
 * They exist so the screen asks only for terms the server accepts: if that
 * function's bounds ever move, these are what should fail first.
 */
describe('what the directory search will send', () => {
  test('surrounding and repeated spaces are ignored, as the route ignores them', () => {
    expect(normalizeSearchTerm('  Ana   María  ')).toBe('Ana María')
  })

  test('an empty box is not an error: the directory simply shows everything', () => {
    expect(searchTermState('')).toBe('idle')
    expect(searchTermState('   ')).toBe('idle')
    expect(searchTermToSend('')).toBeUndefined()
  })

  test('one letter asks for nothing, because the route would refuse it', () => {
    expect(searchTermState('a')).toBe('too-short')
    expect(searchTermToSend('a')).toBeUndefined()
  })

  test('two letters are enough', () => {
    expect(searchTermState('an')).toBe('ready')
    expect(searchTermToSend(' an ')).toBe('an')
  })

  test('eighty characters are accepted and eighty-one are not', () => {
    expect(searchTermState('a'.repeat(80))).toBe('ready')
    expect(searchTermState('a'.repeat(81))).toBe('too-long')
    expect(searchTermToSend('a'.repeat(81))).toBeUndefined()
  })

  test('the raw limit is counted before trimming, the way the route counts it', () => {
    // 200 raw characters that collapse to a short name: the route accepts it.
    expect(searchTermState(`Ana${' '.repeat(197)}`)).toBe('ready')
    expect(searchTermState(' '.repeat(201))).toBe('too-long')
  })

  test('% and _ are characters, never wildcards, so they only make a term', () => {
    expect(searchTermToSend('100%')).toBe('100%')
    expect(searchTermToSend('a_b')).toBe('a_b')
  })
})

/*
 * The destination is not a preference: `OP-REL-019` answers a reader of the
 * whole organization the same 404 as for somebody who does not exist, so
 * sending them to the card would send them to a dead end.
 */
describe('where a person in the list leads', () => {
  const reader = { organizationId: '019ad000-0000-7000-8000-0000000000ff' }
  const entry = RELATIONSHIP as ClientDirectoryRelationship

  test('a coach goes to her card: every row he can see is one he attends', () => {
    expect(clientEntryPath(entry, { ...reader, everyClient: false })).toBe(
      '/organizations/019ad000-0000-7000-8000-0000000000ff/clients/people/019ad000-0000-7000-8000-000000000001',
    )
  })

  test('a reader of the whole gym goes to the relationship, which is theirs', () => {
    expect(clientEntryPath(entry, { ...reader, everyClient: true })).toBe(
      '/organizations/019ad000-0000-7000-8000-0000000000ff/clients/019ad000-0000-7000-8000-000000000301',
    )
  })
})

describe('where the directory search is offered', () => {
  test('not among invitations: until somebody accepts there is no name to match', () => {
    expect(canSearchWithin('invited')).toBe(false)
  })

  test('everywhere else', () => {
    expect(canSearchWithin('all')).toBe(true)
    expect(canSearchWithin('active')).toBe(true)
    expect(canSearchWithin('terminated')).toBe(true)
  })
})

describe('the group a URL asks the directory to open on', () => {
  test('honours each group the contract defines', () => {
    expect(clientFilterFromQuery('invited')).toBe('invited')
    expect(clientFilterFromQuery('active')).toBe('active')
    expect(clientFilterFromQuery('terminated')).toBe('terminated')
  })

  test('falls back to every client when the URL asks for nothing', () => {
    expect(clientFilterFromQuery(undefined)).toBe('all')
  })

  /*
   * A query string is anybody to type. An unknown value must not travel into
   * the request, which the API answers 422.
   */
  test('falls back rather than trusting a value the API would refuse', () => {
    expect(clientFilterFromQuery('pending')).toBe('all')
    expect(clientFilterFromQuery('')).toBe('all')
    expect(clientFilterFromQuery('toString')).toBe('all')
  })

  test('falls back when the parameter is repeated, which makes it an array', () => {
    expect(clientFilterFromQuery(['invited', 'active'])).toBe('all')
  })
})
