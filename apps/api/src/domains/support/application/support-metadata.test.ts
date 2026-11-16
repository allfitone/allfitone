import { describe, expect, test } from 'bun:test'

import type { SupportMetadataDatabase } from '../domain/index.js'

import { createSupportMetadataService } from './index.js'

const READER = {
  actorPersonId: '019a5000-0000-7000-8000-000000000003',
  actorSessionId: '019a5000-0000-7000-8000-000000000023',
}
const SEARCH = {
  requestId: '019a5000-0000-7000-8000-000000000901',
  caseReference: null,
  query: 'epsi',
  limit: 25,
}

function database(found: unknown): SupportMetadataDatabase {
  return {
    search: () => Promise.resolve(found as Awaited<ReturnType<SupportMetadataDatabase['search']>>),
    read: () => Promise.reject(new Error('not read here')),
    payments: () => Promise.reject(new Error('not read here')),
    billingFollowUp: () => Promise.reject(new Error('not read here')),
  }
}

describe('finding a person (HU-BO-006)', () => {
  test('T-SUP-UNIT-01 each match answers its five fields, whatever else the database sends', async () => {
    // A database ahead of the API may answer more; the search passes on only its contract.
    const answer = await createSupportMetadataService(
      database({
        matches: [
          {
            person_id: '019a5000-0000-7000-8000-000000000005',
            display_name: 'Epsilon Ramírez',
            contact_email: 'subject.epsilon@example.test',
            contact_phone: null,
            account_status: 'active',
            contact_email_masked: '••••••••on@example.test',
            active_session_count: 2,
          },
        ],
        has_more: true,
      }),
    ).search(READER, SEARCH)

    expect(answer).toEqual({
      outcome: 'found',
      items: [
        {
          person_id: '019a5000-0000-7000-8000-000000000005',
          display_name: 'Epsilon Ramírez',
          contact_email: 'subject.epsilon@example.test',
          contact_phone: null,
          account_status: 'active',
        },
      ],
      has_more: true,
    })
  })

  test('T-SUP-UNIT-02 no match is said, not answered as an empty list', async () => {
    const answer = await createSupportMetadataService(
      database({ matches: [], has_more: false }),
    ).search(READER, SEARCH)

    expect(answer).toEqual({ outcome: 'not_found', items: [], has_more: false })
  })
})
