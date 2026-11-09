/**
 * The waitlist form, on the landing and on its own page.
 *
 * `/api/waitlist` answers 501 until the backend exists (TECH-292..296), so the
 * joined state is reached by answering the request here with the shape the
 * form accepts. The 501 itself is tested too: it must read as a failure.
 */
import { expect, test, type Page } from '@playwright/test'

const JOINED = { code: 'KEVIN7QH', referrals: 3 }

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
    const section = page.locator('#lista')
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

  test('says what it sends, and a 501 reads as a failure with a way out', async ({ page }) => {
    await page.goto('/es/waitlist')
    const form = await fill(page)
    const request = page.waitForRequest('**/api/waitlist')
    await form.getByRole('button', { name: 'Unirme a la lista' }).click()

    expect((await request).postDataJSON()).toEqual({
      name: 'Kevin',
      email: 'kevin@correo.com',
      consent: true,
      referredBy: null,
      locale: 'es',
    })
    const failure = form.getByRole('alert')
    await expect(failure).toContainText('No pudimos apuntarte.')
    await expect(failure.getByRole('link', { name: 'hello@allfit.one' })).toHaveAttribute(
      'href',
      'mailto:hello@allfit.one',
    )
  })
})

test.describe('joined', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/waitlist', (route) => route.fulfill({ json: JOINED }))
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
    await expect(page.getByText('Llevas 3 de 5 para 1 mes de Allfit Pro.')).toBeVisible()
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

test.describe('a shared link', () => {
  test('names the code the visitor joins with, and sends it', async ({ page }) => {
    await page.route('**/api/waitlist', (route) => route.fulfill({ json: JOINED }))
    await page.goto('/es/waitlist?ref=wal8ert')
    await expect(page.getByText('Te unes con el código WAL8ERT.')).toBeVisible()

    const request = page.waitForRequest('**/api/waitlist')
    await (await fill(page)).getByRole('button', { name: 'Unirme a la lista' }).click()
    expect((await request).postDataJSON()).toMatchObject({ referredBy: 'WAL8ERT' })
  })

  test('keeps the code when the visitor goes to the landing first', async ({ page }) => {
    await page.goto('/en/waitlist?ref=wal8ert')
    await page.goto('/es')
    await expect(page.locator('#lista').getByText('Te unes con el código WAL8ERT.')).toBeVisible()
  })

  test('a code that is not one is ignored', async ({ page }) => {
    await page.goto('/es/waitlist?ref=no-es')
    await expect(page.getByText(/Te unes con el código/)).toHaveCount(0)
  })
})

test('the endpoint is not built yet and says so', async ({ request }) => {
  const response = await request.post('/api/waitlist', { data: {} })
  expect(response.status()).toBe(501)
  expect(await response.json()).toEqual({ error: 'waitlist-not-available' })
})
