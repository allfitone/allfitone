import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

interface Response {
  statusCode?: number
  headers?: { location?: { value: string } }
  uri?: string
}

const template = readFileSync(
  new URL('../../modules/static-site/request.js.tftpl', import.meta.url),
  'utf8',
)

function handlerFor(redirects: Record<string, { location: string; status: number }>) {
  const code = template.replace('${redirects}', JSON.stringify(redirects))
  const context: { handler?: (event: unknown) => Response } = {}
  runInNewContext(`${code}\nthis.handler = handler`, context)
  const { handler } = context
  if (!handler) throw new Error('the template defines no handler')
  return (uri: string) => handler({ request: { uri } })
}

describe('the static site request function', () => {
  const request = handlerFor({
    '/': { location: '/es', status: 302 },
    '/privacy/analytics': { location: '/es/privacy/analytics', status: 301 },
  })

  test('answers a configured redirect with its status and location', () => {
    expect(request('/')).toMatchObject({ statusCode: 302, headers: { location: { value: '/es' } } })
    expect(request('/privacy/analytics')).toMatchObject({
      statusCode: 301,
      headers: { location: { value: '/es/privacy/analytics' } },
    })
  })

  test('serves a clean path from the file Next exported for it', () => {
    expect(request('/es').uri).toBe('/es.html')
    expect(request('/es/ambassadors/kevin').uri).toBe('/es/ambassadors/kevin.html')
  })

  test('leaves files alone', () => {
    expect(request('/_next/static/chunks/app.js').uri).toBe('/_next/static/chunks/app.js')
    expect(request('/design/ink-and-signal.html').uri).toBe('/design/ink-and-signal.html')
    expect(request('/robots.txt').uri).toBe('/robots.txt')
  })

  test('drops a trailing slash with a permanent redirect', () => {
    expect(request('/es/')).toMatchObject({
      statusCode: 301,
      headers: { location: { value: '/es' } },
    })
  })

  test('serves the index at the root when nothing redirects it', () => {
    expect(handlerFor({})('/').uri).toBe('/index.html')
  })
})
