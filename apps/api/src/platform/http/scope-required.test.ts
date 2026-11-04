import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'

import { failScopeRequired, requiredScope } from './index.js'

/** What postgres.js throws when a function raises AF430 with the scope in the detail. */
const refusal = (detail: unknown) =>
  Object.assign(new Error('the person does not share this'), { code: 'AF430', detail })

describe('requiredScope', () => {
  test('reads the scope and level a function found missing', () => {
    expect(requiredScope(refusal('relationship_training:contribute'))).toEqual({
      code: 'relationship_training',
      level: 'contribute',
    })
    expect(requiredScope(refusal('body_progress:read'))).toEqual({
      code: 'body_progress',
      level: 'read',
    })
  })

  test('nothing for any other refusal', () => {
    const other = Object.assign(new Error('x'), {
      code: '42501',
      detail: 'relationship_training:read',
    })
    expect(requiredScope(other)).toBeUndefined()
    expect(requiredScope(new Error('x'))).toBeUndefined()
    expect(requiredScope(null)).toBeUndefined()
  })

  test('nothing when the detail is not a scope and a known level', () => {
    expect(requiredScope(refusal('relationship_training'))).toBeUndefined()
    expect(requiredScope(refusal('relationship_training:admin'))).toBeUndefined()
    expect(requiredScope(refusal('DROP TABLE:read'))).toBeUndefined()
    expect(requiredScope(refusal(42))).toBeUndefined()
  })
})

test('the problem names the scope and the level to ask for', async () => {
  const app = new Hono().get('/', (c) =>
    failScopeRequired(c, { code: 'relationship_training', level: 'read' }),
  )
  const response = await app.request('/')
  expect(response.status).toBe(403)
  expect(response.headers.get('content-type')).toContain('application/problem+json')
  expect(await response.json()).toMatchObject({
    type: 'https://errors.allfit.invalid/scope-required',
    title: 'Required consent is not effective',
    status: 403,
    required_scope: { code: 'relationship_training', level: 'read' },
  })
})
