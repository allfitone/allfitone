/**
 * What search engines and link previews read from Studio.
 *
 * The landing at `/es` and `/en` is public and indexable; the workspace behind
 * it is not. Both are read as served HTML, before any script runs, because that
 * is what a crawler sees first. `robots.txt` blocks nothing on purpose: a
 * blocked page cannot show a crawler its `noindex`.
 */
import { expect, test } from '@playwright/test'

const SITE = 'https://studio.allfit.one'

test('the landing can be indexed and names every version of itself', async ({ request }) => {
  const html = await (await request.get('/es')).text()

  expect(html).toContain('<meta name="robots" content="index, follow"/>')
  expect(html).toContain(`<link rel="canonical" href="${SITE}/es"/>`)
  expect(html).toContain(`<link rel="alternate" hrefLang="en" href="${SITE}/en"/>`)
  expect(html).toContain(`<link rel="alternate" hrefLang="x-default" href="${SITE}"/>`)
  expect(html).toContain(`<meta property="og:url" content="${SITE}/es"/>`)
  expect(html).toContain(`<meta property="og:image" content="${SITE}/images/og-es.png"/>`)
  expect(html).toContain('<meta property="og:image:alt"')
})

test('the landing describes Studio as Allfit One’s', async ({ request }) => {
  const html = await (await request.get('/en')).text()
  const block = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1]
  expect(block).toBeDefined()

  const graph = (JSON.parse(block ?? '{}') as { '@graph': Record<string, unknown>[] })['@graph']
  expect(graph.find((node) => node['@type'] === 'WebApplication')).toMatchObject({
    url: `${SITE}/en`,
    publisher: { '@id': 'https://www.allfit.one/#organization' },
  })
})

test('the workspace stays out of the index', async ({ request }) => {
  const html = await (await request.get('/app')).text()

  expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>')
  expect(html).not.toContain('application/ld+json')
})

test('robots.txt blocks nothing and the sitemap lists the landing only', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  const rules = await robots.text()
  expect(rules).toContain(`Sitemap: ${SITE}/sitemap.xml`)
  expect(rules).not.toContain('Disallow')

  const sitemap = await (await request.get('/sitemap.xml')).text()
  expect(sitemap).toContain(`<loc>${SITE}/es</loc>`)
  expect(sitemap).toContain(`<loc>${SITE}/en</loc>`)
  expect(sitemap).toContain(`hreflang="x-default" href="${SITE}"`)
  expect(sitemap).not.toMatch(/<loc>[^<]*\/(app|organizations|account|profile|invitations)/)
})

test('the image a shared link is previewed with exists', async ({ request }) => {
  for (const locale of ['es', 'en']) {
    const image = await request.get(`/images/og-${locale}.png`)
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toBe('image/png')
  }
})
