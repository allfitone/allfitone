/**
 * The pages the waitlist emails open: confirming the email, «mi link» and leaving.
 *
 * Each email link carries its token in the fragment. The suite opens the pages the
 * way an email does and answers the relay (`/api/waitlist/*`) in the browser with
 * the shapes the API documents (OP-WL-002, OP-WL-004, OP-WL-005), so it never
 * needs the API.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Request } from '@playwright/test'

const TOKEN = 'kQ3v9Zp_Lm2-Xc8Rt4Yw6Ub1Na7Hs5Jd0Fg3Ek2Ci9B'
const LINK = { referral_code: 'KEVIN7QH', referrals: 7, language: 'es', confirmed: true }

/** Answers one relay operation and keeps every request it receives. */
async function answer(page: Page, operation: string, status: number, json?: unknown) {
  const requests: Request[] = []
  await page.route(`**/api/waitlist/${operation}`, (route) => {
    requests.push(route.request())
    return json === undefined ? route.fulfill({ status }) : route.fulfill({ status, json })
  })
  return requests
}

test('the token is a fragment that never reaches the server, and it leaves the address bar', async ({
  page,
}) => {
  const requests = await answer(page, 'confirmations', 200, { status: 'confirmed' })
  const served: string[] = []
  page.on('request', (request) => served.push(request.url()))
  await page.goto(`/es/waitlist/confirm#token=${TOKEN}`)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Correo confirmado.')
  expect(requests.map((request) => request.postDataJSON() as unknown)).toEqual([{ token: TOKEN }])
  await expect(page).toHaveURL(/\/es\/waitlist\/confirm$/)
  expect(served.filter((url) => url.includes(TOKEN))).toEqual([])
})

test.describe('the confirmation link', () => {
  test('confirms as soon as it opens, once', async ({ page }) => {
    const requests = await answer(page, 'confirmations', 200, { status: 'confirmed' })
    await page.goto(`/es/waitlist/confirm#token=${TOKEN}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Correo confirmado.')
    await expect(page.getByText(/Tu lugar en la lista cuenta desde ahora/)).toBeVisible()
    expect(requests).toHaveLength(1)
  })

  test('an address confirmed before says so, and a refresh still finds the token', async ({
    page,
  }) => {
    const requests = await answer(page, 'confirmations', 200, { status: 'already_confirmed' })
    await page.goto(`/en/waitlist/confirm#token=${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Your email was already confirmed.',
    )

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Your email was already confirmed.',
    )
    expect(requests.map((request) => request.postDataJSON() as unknown)).toEqual([
      { token: TOKEN },
      { token: TOKEN },
    ])
  })

  test('a failure can be tried again', async ({ page }) => {
    let calls = 0
    await page.route('**/api/waitlist/confirmations', (route) => {
      calls += 1
      return calls === 1
        ? route.fulfill({ status: 502, json: { error: 'unavailable' } })
        : route.fulfill({ status: 200, json: { status: 'confirmed' } })
    })
    await page.goto(`/es/waitlist/confirm#token=${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'No pudimos revisar tu enlace.',
    )

    await page.getByRole('button', { name: 'Intentar de nuevo' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Correo confirmado.')
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  })
})

test.describe('«mi link»', () => {
  test('shows the code, the link and how many signed up with it', async ({ page }) => {
    const requests = await answer(page, 'link-reads', 200, LINK)
    await page.goto(`/es/waitlist/referrals#token=${TOKEN}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu link de Allfit Space')
    await expect(page.getByText('KEVIN7QH', { exact: true })).toBeVisible()
    await expect(page.getByText('space.allfit.one/es/waitlist?ref=KEVIN7QH')).toBeVisible()
    await expect(page.getByText('Registrados con tu link: 7.')).toBeVisible()
    await expect(page.getByText('Te falta confirmar tu correo.')).toHaveCount(0)
    expect(requests.map((request) => request.postDataJSON() as unknown)).toEqual([{ token: TOKEN }])
  })

  test('an unconfirmed address is reminded to confirm', async ({ page }) => {
    await answer(page, 'link-reads', 200, { ...LINK, confirmed: false })
    await page.goto(`/es/waitlist/referrals#token=${TOKEN}`)
    await expect(page.getByText('Te falta confirmar tu correo.')).toBeVisible()
  })

  test('passes axe on a phone', async ({ page }) => {
    await answer(page, 'link-reads', 200, { ...LINK, confirmed: false })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/es/waitlist/referrals#token=${TOKEN}`)
    await expect(page.getByText('KEVIN7QH', { exact: true })).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const blocking = results.violations.filter(({ impact }) =>
      ['serious', 'critical'].includes(impact ?? ''),
    )
    expect(blocking.map(({ id }) => id)).toEqual([])
  })
})

test.describe('leaving', () => {
  test('asks first, and sends nothing until the person says yes', async ({ page }) => {
    const requests = await answer(page, 'departures', 204)
    await page.goto(`/es/waitlist/leave#token=${TOKEN}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      '¿Seguro que quieres salir de la lista?',
    )
    await expect(page).toHaveURL(/\/es\/waitlist\/leave$/)
    expect(requests).toHaveLength(0)

    await page.getByRole('button', { name: 'Sí, salir de la lista' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Saliste de la lista.')
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    expect(requests.map((request) => request.postDataJSON() as unknown)).toEqual([{ token: TOKEN }])
  })

  test('once left, the tab no longer holds the link', async ({ page }) => {
    await answer(page, 'departures', 204)
    const reads = await answer(page, 'link-reads', 200, LINK)
    await page.goto(`/es/waitlist/leave#token=${TOKEN}`)
    await page.getByRole('button', { name: 'Sí, salir de la lista' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Saliste de la lista.')

    await page.goto('/es/waitlist/referrals')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Este enlace ya no sirve.')
    expect(reads).toHaveLength(0)
  })

  test('staying opens «mi link» with the same token, without it in the address', async ({
    page,
  }) => {
    const reads = await answer(page, 'link-reads', 200, LINK)
    await page.goto(`/es/waitlist/leave#token=${TOKEN}`)
    const stay = page.getByRole('link', { name: 'Quedarme en la lista' })
    await expect(stay).toHaveAttribute('href', '/es/waitlist/referrals')

    await stay.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu link de Allfit Space')
    expect(reads.map((request) => request.postDataJSON() as unknown)).toEqual([{ token: TOKEN }])
  })
})

test.describe('a link that does not work', () => {
  test('gets one answer and a way to ask for the email again', async ({ page }) => {
    await answer(page, 'confirmations', 404, { error: 'not-found' })
    const asked = await answer(page, 'email-requests', 202)
    await page.goto(`/es/waitlist/confirm#token=${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Este enlace ya no sirve.')

    await page.getByRole('button', { name: 'Enviarme un enlace nuevo' }).click()
    await expect(page.getByText('Escribe tu correo para recibir el enlace.')).toBeVisible()
    await expect(page.getByLabel('Tu correo')).toBeFocused()

    await page.getByLabel('Tu correo').fill('kevin@correo.com')
    await page.getByRole('button', { name: 'Enviarme un enlace nuevo' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revisa tu correo.')
    await expect(page.getByText(/Si kevin@correo\.com está en la lista/)).toBeVisible()
    expect(asked.map((request) => request.postDataJSON() as unknown)).toEqual([
      { email: 'kevin@correo.com' },
    ])
  })

  test('a page opened without a token, or with one cut short, never asks the API', async ({
    page,
  }) => {
    const relayed: string[] = []
    await page.route('**/api/waitlist/**', (route) => {
      relayed.push(route.request().url())
      return route.fulfill({ status: 500 })
    })
    for (const path of [
      '/es/waitlist/leave',
      '/es/waitlist/referrals',
      `/en/waitlist/confirm#token=${TOKEN.slice(0, 20)}`,
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        /Este enlace ya no sirve\.|This link no longer works\./,
      )
    }
    expect(relayed).toEqual([])
  })
})

test('the link pages stay out of search and send no Referer', async ({ request }) => {
  for (const path of ['/es/waitlist/confirm', '/en/waitlist/referrals', '/es/waitlist/leave']) {
    const response = await request.get(path)
    expect(response.status()).toBe(200)
    expect(response.headers()['referrer-policy']).toBe('no-referrer')
    expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow')
    const html = await response.text()
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>')
    expect(html).toContain('<meta name="referrer" content="no-referrer"/>')
  }
})
