/**
 * The waitlist form, on the landing and on its own page.
 *
 * The browser posts to this app's relay (`/api/waitlist/signups`), which forwards
 * to the API from the server. The suite answers that request in the browser with
 * the shapes the API documents (OP-WL-001), so it never needs the API; the relay
 * itself is covered by `src/lib/waitlist-relay.test.ts`.
 */
import { expect, test, type Page } from '@playwright/test'

const SIGNUPS = '**/api/waitlist/signups'
const JOINED = { status: 'joined', referral_code: 'KEVIN7QH', referrals: 3 }

async function fill(page: Page, form = page.locator('form').first()) {
  await form.getByLabel('Tu nombre').fill('Kevin')
  await form.getByLabel('Tu correo').fill('kevin@correo.com')
  await form.getByRole('checkbox').check()
  return form
}

test.describe('the way in', () => {
  test('the hero and the header lead to the waitlist page', async ({ page }) => {
    await page.goto('/es')
    const hero = page.getByRole('link', { name: 'Únete a la lista de espera' })
    await expect(hero).toHaveAttribute('href', '/es/waitlist')
    const header = page.getByRole('banner').getByRole('link', { name: 'Únete a la lista' })
    await expect(header).toHaveAttribute('href', '/es/waitlist')

    await hero.click()
    await expect(page).toHaveURL(/\/es\/waitlist$/)
    await expect(page).toHaveTitle('Lista de espera | Allfit Space')
  })

  test('the landing has the form too, under its own section', async ({ page }) => {
    await page.goto('/es')
    const section = page.locator('#waitlist')
    await expect(section.getByRole('heading', { name: /PRIMEROS 100/ })).toBeVisible()
    await expect(section.getByRole('button', { name: 'Unirme a la lista' })).toBeVisible()
  })
})

test.describe('the form', () => {
  test('starts empty and unchecked, with the policy one click away in a new tab', async ({
    page,
  }) => {
    await page.goto('/es/waitlist')
    const form = page.locator('form')
    await expect(form.getByLabel('Tu nombre')).toHaveValue('')
    await expect(form.getByLabel('Tu correo')).toHaveValue('')
    await expect(form.getByRole('checkbox')).not.toBeChecked()

    const policy = form.getByRole('link', { name: /política de privacidad/ })
    await expect(policy).toHaveAttribute('href', 'https://www.allfit.one/es/legal/privacy')
    await expect(policy).toHaveAttribute('target', '_blank')
  })

  test('marks every missing field and takes the visitor to the first', async ({ page }) => {
    await page.goto('/es/waitlist')
    await page.getByRole('button', { name: 'Unirme a la lista' }).click()

    await expect(page.getByText('Escribe tu nombre para unirte.')).toBeVisible()
    await expect(page.getByText('Escribe tu correo para unirte.')).toBeVisible()
    await expect(page.getByText('Para unirte necesitamos tu autorización.')).toBeVisible()
    await expect(page.getByLabel('Tu nombre')).toBeFocused()
    await expect(page.locator('form').getByRole('alert')).toHaveCount(1)
  })

  test('asks for an email that looks like one', async ({ page }) => {
    await page.goto('/es/waitlist')
    const form = await fill(page)
    await form.getByLabel('Tu correo').fill('kevin@correo')
    await form.getByRole('button', { name: 'Unirme a la lista' }).click()

    await expect(page.getByText(/Revisa el correo/)).toBeVisible()
    await expect(form.getByLabel('Tu correo')).toBeFocused()
  })

  test('says what it sends, and a failure gives a way out', async ({ page }) => {
    await page.route(SIGNUPS, (route) =>
      route.fulfill({ status: 503, json: { error: 'unavailable' } }),
    )
    await page.goto('/es/waitlist')
    const form = await fill(page)
    const request = page.waitForRequest(SIGNUPS)
    await form.getByRole('button', { name: 'Unirme a la lista' }).click()

    expect((await request).postDataJSON()).toEqual({
      name: 'Kevin',
      email: 'kevin@correo.com',
      language: 'es',
      consent: true,
    })
    const failure = form.getByRole('alert')
    await expect(failure).toContainText('No pudimos apuntarte.')
    await expect(failure.getByRole('link', { name: 'hello@allfit.one' })).toHaveAttribute(
      'href',
      'mailto:hello@allfit.one',
    )
  })

  test('a disposable address is marked under the email field', async ({ page }) => {
    await page.route(SIGNUPS, (route) =>
      route.fulfill({ status: 422, json: { error: 'disposable-email' } }),
    )
    await page.goto('/es/waitlist')
    const form = await fill(page)
    await form.getByRole('button', { name: 'Unirme a la lista' }).click()

    await expect(form.getByRole('alert')).toHaveText(/Ese correo es desechable/)
    await expect(form.getByLabel('Tu correo')).toBeFocused()
    await expect(form.getByLabel('Tu correo')).toHaveAttribute('aria-invalid', 'true')
  })

  test('too many attempts say when to try again', async ({ page }) => {
    await page.route(SIGNUPS, (route) =>
      route.fulfill({ status: 429, json: { error: 'rate-limited' } }),
    )
    await page.goto('/es/waitlist')
    const form = await fill(page)
    await form.getByRole('button', { name: 'Unirme a la lista' }).click()

    await expect(form.getByRole('alert')).toHaveText(/Inténtalo de nuevo en una hora\./)
  })
})

test.describe('joined', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(SIGNUPS, (route) => route.fulfill({ status: 201, json: JOINED }))
  })

  test('shows the code, the link and the ways to share it', async ({ page }) => {
    await page.goto('/es/waitlist')
    await (await fill(page)).getByRole('button', { name: 'Unirme a la lista' }).click()

    await expect(page.getByText('Ya estás en la lista, Kevin.')).toBeFocused()
    await expect(page.getByText('kevin@correo.com', { exact: true })).toBeVisible()
    await expect(page.getByText('KEVIN7QH', { exact: true })).toBeVisible()
    await expect(page.getByText('space.allfit.one/es/waitlist?ref=KEVIN7QH')).toBeVisible()

    const whatsapp = page.getByRole('link', { name: /Compartir por WhatsApp/ })
    await expect(whatsapp).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/\?text=.*https%3A%2F%2Fspace\.allfit\.one%2Fes%2Fwaitlist%3Fref%3DKEVIN7QH$/,
    )
    await expect(whatsapp).toHaveAttribute('target', '_blank')
    await expect(page.getByText('Registrados con tu link: 3.')).toBeVisible()
    await expect(page.getByText('Para los premios de Allfit Pro cuentan los activos')).toBeVisible()
  })

  test('copies the whole link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/es/waitlist')
    await (await fill(page)).getByRole('button', { name: 'Unirme a la lista' }).click()

    await page.getByRole('button', { name: 'Copiar' }).click()
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'https://space.allfit.one/es/waitlist?ref=KEVIN7QH',
    )
  })

  test('another email brings the form back with the name kept', async ({ page }) => {
    await page.goto('/es/waitlist')
    await (await fill(page)).getByRole('button', { name: 'Unirme a la lista' }).click()
    await page.getByRole('button', { name: 'Usar otro correo' }).click()

    await expect(page.getByLabel('Tu nombre')).toHaveValue('Kevin')
    await expect(page.getByLabel('Tu correo')).toBeFocused()
  })
})

test('an address already on the list gets its link by email, never on screen', async ({ page }) => {
  await page.route(SIGNUPS, (route) =>
    route.fulfill({ status: 202, json: { status: 'already_listed' } }),
  )
  await page.goto('/es/waitlist')
  await (await fill(page)).getByRole('button', { name: 'Unirme a la lista' }).click()

  await expect(page.getByText('Ya estabas en la lista, Kevin.')).toBeFocused()
  await expect(page.getByText(/Te escribimos de nuevo a kevin@correo\.com/)).toBeVisible()
  // Exact: the terms on the same page say «tu código» in a sentence.
  await expect(page.getByText('Tu código', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Compartir por WhatsApp/ })).toHaveCount(0)
})

test.describe('a shared link', () => {
  test('names the code the visitor joins with, and sends it', async ({ page }) => {
    await page.route(SIGNUPS, (route) => route.fulfill({ status: 201, json: JOINED }))
    await page.goto('/es/waitlist?ref=wal8ert')
    await expect(page.getByText('Te unes con el código WAL8ERT.')).toBeVisible()

    const request = page.waitForRequest(SIGNUPS)
    await (await fill(page)).getByRole('button', { name: 'Unirme a la lista' }).click()
    expect((await request).postDataJSON()).toMatchObject({ referral_code: 'WAL8ERT' })
  })

  test('keeps the code when the visitor goes to the landing first', async ({ page }) => {
    await page.goto('/en/waitlist?ref=wal8ert')
    // The page keeps the code once it runs in the browser; leaving before that keeps nothing.
    await expect(page.getByText("You're joining with code WAL8ERT.")).toBeVisible()
    await page.goto('/es')
    await expect(
      page.locator('#waitlist').getByText('Te unes con el código WAL8ERT.'),
    ).toBeVisible()
  })

  test('a code that is not one is ignored', async ({ page }) => {
    await page.goto('/es/waitlist?ref=no-es')
    await expect(page.getByText(/Te unes con el código/)).toHaveCount(0)
  })
})

test('a campaign link counts even when the person joins from another page', async ({ page }) => {
  await page.route(SIGNUPS, (route) => route.fulfill({ status: 201, json: JOINED }))
  await page.goto('/es?utm_source=instagram&utm_medium=story&utm_campaign=launch')
  await expect(page.locator('#waitlist').getByRole('button')).toBeVisible()
  await page.goto('/es/waitlist')

  const request = page.waitForRequest(SIGNUPS)
  await (await fill(page)).getByRole('button', { name: 'Unirme a la lista' }).click()
  expect((await request).postDataJSON()).toMatchObject({
    utm_source: 'instagram',
    utm_medium: 'story',
    utm_campaign: 'launch',
  })
})

test('the relay answers nothing useful without its settings, and nothing for other paths', async ({
  request,
}) => {
  const response = await request.post('/api/waitlist/signups', { data: {} })
  expect(response.status()).toBe(503)
  expect(await response.json()).toEqual({ error: 'unavailable' })
  expect((await request.post('/api/waitlist/admin', { data: {} })).status()).toBe(404)
})
