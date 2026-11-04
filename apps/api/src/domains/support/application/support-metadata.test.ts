import { describe, expect, test } from 'bun:test'

import type { SupportMetadataDatabase } from '../domain/index.js'

import { createSupportMetadataService } from './index.js'

const READER = {
  actorPersonId: '019a5000-0000-7000-8000-000000000003',
  actorSessionId: '019a5000-0000-7000-8000-000000000023',
}
const SEARCH = {
  requestId: '019a5000-0000-7000-8000-000000000901',
  caseReference: 'CASE-2026-101',
  lookupKind: 'email' as const,
  lookupValue: 'subject.epsilon@example.test',
}

function database(found: unknown): SupportMetadataDatabase {
  return {
    search: () => Promise.resolve(found as Awaited<ReturnType<SupportMetadataDatabase['search']>>),
    read: () => Promise.reject(new Error('not read here')),
    payments: () => Promise.reject(new Error('not read here')),
  }
}

describe('finding a person (HU-BO-006)', () => {
  test('T-SUP-UNIT-01 a match answers its four fields, whatever else the database sends', async () => {
    // A database older than the API still answers the whole file; the search must not.
    const answer = await createSupportMetadataService(
      database({
        person_id: '019a5000-0000-7000-8000-000000000005',
        account_status: 'active',
        contact_email_masked: '••••••••on@example.test',
        contact_phone_masked: null,
        active_session_count: 2,
        last_seen_at: '2026-09-09T18:00:00.000Z',
        membership_count: 1,
      }),
    ).search(READER, SEARCH)

    expect(answer).toEqual({
      outcome: 'found',
      items: [
        {
          person_id: '019a5000-0000-7000-8000-000000000005',
          account_status: 'active',
          contact_email_masked: '••••••••on@example.test',
          contact_phone_masked: null,
        },
      ],
    })
  })

  test('T-SUP-UNIT-02 no match is said, not answered as an empty list', async () => {
    const answer = await createSupportMetadataService(database(undefined)).search(READER, SEARCH)

    expect(answer).toEqual({ outcome: 'not_found', items: [] })
  })
})
