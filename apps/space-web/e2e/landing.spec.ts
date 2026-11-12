/**
 * Smoke and accessibility sweep of every public page, on desktop and phone.
 *
 * axe runs against WCAG 2.2 AA (DT-010). Only `serious` and `critical` impacts
 * fail the suite; lower ones are printed for review, as Studio does.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
const BLOCKING = new Set(['serious', 'critical'])
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]
const PAGES = [
  { path: '/es', heading: /SUPERA/ },
  { path: '/en', heading: /BEAT/ },
]

test.describe('language', () => {
  test('the root opens in Spanish whatever language the browser prefers', async ({ browser }) => {
    for (const locale of ['es-CO', 'en-US']) {
      const context = await browser.newContext({ locale })
      const page = await context.newPage()
      await page.goto('/')
      await expect(page).toHaveURL(/\/es$/)
      await context.close()
    }
  })

  test('a page without a language opens in Spanish and keeps its path', async ({ request }) => {
    const response = await request.get('/programs', {
      headers: { 'accept-language': 'en-US' },
      maxRedirects: 0,
    })
    expect(response.headers().location).toMatch(/\/es\/programs$/)
  })

  test('a language the site does not have is not found', async ({ page }) => {
    const response = await page.goto('/es/fr')
    expect(response?.status()).toBe(404)
  })

  test('the switch keeps the visitor on the same page', async ({ page }) => {
    await page.goto('/es')
    await page.getByRole('link', { name: 'EN', exact: true }).click()
    await expect(page).toHaveURL(/\/en$/)
  })
})

test('the stores read as coming soon while there is no link', async ({ page }) => {
  await page.goto('/es')
  await expect(page.getByText('Próximamente en').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /App Store|Google Play/ })).toHaveCount(0)
})

// Fragments are part of the address, so they are named in English like every route.
test('every section link in the header lands on its section, named in English', async ({
  page,
}) => {
  for (const path of ['/es', '/en']) {
    await page.goto(path)
    const hrefs = await page
      .locator('header a[href^="#"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    expect(hrefs).toEqual(['#app', '#programs', '#privacy', '#gyms'])
    for (const href of hrefs) await expect(page.locator(`section${href ?? ''}`)).toHaveCount(1)
    await expect(page.locator('a.skip')).toHaveAttribute('href', '#content')
    await expect(page.locator('main#content')).toHaveCount(1)
  }
})

test('the share story moves only when the visitor picks a step', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/es')
  const story = page.locator('#records-story')
  await story.scrollIntoViewIfNeeded()
  // It used to advance on its own every 2.8 s, with no way to pause it (WCAG 2.2.2).
  await page.waitForTimeout(3500)
  await expect(story).toHaveAttribute('data-step', '0')

  const choose = page.getByRole('button', { name: /ELIGES/ })
  await choose.click()
  await expect(story).toHaveAttribute('data-step', '1')
  await expect(choose).toHaveAttribute('aria-current', 'step')
})

test('the footer opens Allfit One and Allfit Studio side by side, in new tabs', async ({
  page,
}) => {
  await page.goto('/es')
  const footer = page.getByRole('contentinfo')
  const family = footer.getByRole('link', { name: /^Allfit (One|Studio)\b/ })
  await expect(family).toHaveCount(2)
  await expect(family.nth(0)).toHaveAttribute('href', 'https://www.allfit.one/es')
  await expect(family.nth(1)).toHaveAttribute('href', 'https://studio.allfit.one/es')
  for (const link of await family.all()) {
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
  // Side by side: the two share a row, apart from the legal links.
  const [one, studio] = await Promise.all([
    family.nth(0).boundingBox(),
    family.nth(1).boundingBox(),
  ])
  expect(Math.abs((one?.y ?? 0) - (studio?.y ?? -100))).toBeLessThan(4)
})

test.describe('legal documents', () => {
  test('the footer opens the three legal documents on www.allfit.one, in new tabs', async ({
    page,
  }) => {
    await page.goto('/en')
    const footer = page.getByRole('contentinfo')
    for (const [name, document] of [
      ['Terms', 'terms'],
      ['Privacy', 'privacy'],
      ['Analytics', 'analytics'],
    ] as const) {
      const link = footer.getByRole('link', { name: `${name} Opens in a new tab.`, exact: true })
      await expect(link).toHaveAttribute('href', `https://www.allfit.one/en/legal/${document}`)
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  test('the former legal pages redirect there for good', async ({ request }) => {
    for (const [from, to] of [
      ['/es/terms', 'https://www.allfit.one/es/legal/terms'],
      ['/en/privacy', 'https://www.allfit.one/en/legal/privacy'],
      ['/privacy', 'https://www.allfit.one/es/legal/privacy'],
    ] as const) {
      const response = await request.get(from, { maxRedirects: 0 })
      expect(response.status(), from).toBe(308)
      expect(response.headers().location).toBe(to)
    }
  })
})

test.describe('search engines', () => {
  const SITE = 'https://space.allfit.one'

  test('the landing can be indexed and names every version of itself', async ({ request }) => {
    const html = await (await request.get('/es')).text()

    expect(html).toContain('<meta name="robots" content="index, follow"/>')
    expect(html).toContain(`<link rel="canonical" href="${SITE}/es"/>`)
    expect(html).toContain(`<link rel="alternate" hrefLang="en" href="${SITE}/en"/>`)
    expect(html).toContain(`<link rel="alternate" hrefLang="x-default" href="${SITE}"/>`)
    expect(html).toContain(`<meta property="og:url" content="${SITE}/es"/>`)
    expect(html).toContain(`<meta property="og:image" content="${SITE}/images/og.jpg"/>`)
    expect(html).toContain('<meta property="og:image:alt"')
  })

  test('the landing describes the app as Allfit One’s', async ({ request }) => {
    const html = await (await request.get('/en')).text()
    const block = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1]
    expect(block).toBeDefined()

    const graph = (JSON.parse(block ?? '{}') as { '@graph': Record<string, unknown>[] })['@graph']
    expect(graph.find((node) => node['@type'] === 'MobileApplication')).toMatchObject({
      url: `${SITE}/en`,
      publisher: { '@id': 'https://www.allfit.one/#organization' },
    })
  })

  test('robots.txt and the sitemap point at the landing only', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`)

    const sitemap = await (await request.get('/sitemap.xml')).text()
    expect(sitemap).toContain(`<loc>${SITE}/es</loc>`)
    expect(sitemap).toContain(`<loc>${SITE}/en</loc>`)
    expect(sitemap).toContain(`hreflang="x-default" href="${SITE}"`)
    expect(sitemap).not.toContain('/privacy')
    expect(sitemap).not.toContain('/terms')
  })
})

for (const viewport of VIEWPORTS) {
  test.describe(`accessibility · ${viewport.name}`, () => {
    for (const target of PAGES) {
      test(target.path, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto(target.path)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(target.heading)

        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
        for (const violation of results.violations) {
          const where = violation.nodes.map((node) => node.target.join(' ')).join(' | ')
          console.log(
            `[${violation.impact ?? '-'}] ${violation.id} — ${violation.help}\n    ${where}`,
          )
        }
        const blocking = results.violations.filter(({ impact }) => BLOCKING.has(impact ?? ''))
        expect(blocking.map(({ id }) => id)).toEqual([])
      })
    }
  })
}
