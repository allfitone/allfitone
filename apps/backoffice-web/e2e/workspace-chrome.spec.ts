import { expect, test, type Page } from '@playwright/test'

import { activeSession, createBackofficeFixture, mockBackofficeApi } from './backoffice-api-mock'

/**
 * The chrome every Backoffice screen shares. Each check here is a defect that
 * reached production because nothing looked at the page in a browser: buttons
 * painted with the browser's own grey face under near-white text, and two
 * navigation entries lit at once.
 */

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/** Every visible ghost or link button, with the face the browser gives a bare button here. */
function ghostFaces(page: Page) {
  return page.evaluate(() => {
    const bare = document.body.appendChild(document.createElement('button'))
    const browserFace = getComputedStyle(bare).backgroundColor
    bare.remove()
    const buttons = [
      ...document.querySelectorAll('button[data-variant="ghost"], button[data-variant="link"]'),
    ].filter((button) => button.getClientRects().length > 0)
    return {
      browserFace,
      buttons: buttons.map((button) => ({
        name: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
        expanded: button.getAttribute('aria-expanded') === 'true',
        background: getComputedStyle(button).backgroundColor,
      })),
    }
  })
}

// Below 600px Backoffice shows only its device gate, so a portrait tablet is the narrowest case.
// The hovered button is one the menu leaves unexpanded and Next's dev indicator leaves clear.
for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, hovered: 'Cerrar sesión' },
  { name: 'tablet', width: 768, height: 1024, hovered: 'Abrir o cerrar navegación' },
]) {
  test(`a ghost button lets the workspace show through at ${viewport.name}`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await mockBackofficeApi(context, createBackofficeFixture({ session: activeSession() }))
    await page.goto('/team')
    const hovered = page.getByRole('button', { name: viewport.hovered })
    await expect(hovered).toBeVisible()

    // Polled: below 1100px the menu folds on load, and its toggle fades its fill out.
    await expect
      .poll(async () => {
        const { browserFace, buttons } = await ghostFaces(page)
        return buttons
          .filter((button) => button.background === browserFace || !button.expanded)
          .filter((button) => button.background !== TRANSPARENT)
          .map((button) => `${button.name}: ${button.background}`)
      }, 'a ghost button is painted when it is neither expanded nor hovered')
      .toEqual([])

    // The fix must sit below the library's utilities, or hover would stop painting.
    await hovered.hover()
    await expect
      .poll(() => hovered.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(TRANSPARENT)
  })
}

/*
 * The Backoffice is Allfit One's internal tool and its operators are staff, so it
 * measures nothing in their browser and asks them nothing about it: no analytics
 * notice, no privacy control, and no call to a telemetry gate.
 */
test('the Backoffice asks its operators nothing about analytics', async ({ context, page }) => {
  const gateCalls: string[] = []
  page.on('request', (request) => {
    if (/telemetry-config|posthog/i.test(request.url())) gateCalls.push(request.url())
  })
  await mockBackofficeApi(context, createBackofficeFixture({ session: activeSession() }))

  for (const path of ['/', '/team']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByText('Analítica opcional')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Privacidad' })).toHaveCount(0)
  }
  expect(gateCalls).toEqual([])
})

test('lights one navigation entry, the one the screen is', async ({ context, page }) => {
  await mockBackofficeApi(context, createBackofficeFixture({ session: activeSession() }))
  await page.goto('/catalogue/result-contracts')
  await expect(page).toHaveTitle('Reglas de resultados · Allfit Backoffice')

  // The library marks the lit entry with a bare `data-active` attribute.
  const active = page.locator('[data-backoffice-sidebar] a[data-active]:not([data-active="false"])')
  await expect(active).toHaveCount(1)
  await expect(active).toContainText('Reglas de resultados')
})

test('groups the navigation by area and names the area over the title', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(context, createBackofficeFixture({ session: activeSession() }))
  await page.goto('/erasure-requests')

  const groups = page.locator('[data-backoffice-sidebar] [data-backoffice-area]')
  await expect(groups).toHaveCount(3)
  await expect(groups.nth(0)).toContainText('Soporte y operación')
  await expect(groups.nth(1)).toContainText('Curaduría y verificación')
  await expect(groups.nth(2)).toContainText('Seguridad y privacidad')
  await expect(groups.nth(2).locator('a[data-active]:not([data-active="false"])')).toContainText(
    'Solicitudes de eliminación',
  )

  const header = page.locator('header')
  await expect(header).toContainText('Seguridad y privacidad')
  await expect(header.getByRole('heading', { level: 1 })).toHaveText('Solicitudes de eliminación')

  // Thirteen entries and three labels have to fit above the operator's name.
  const sidebar = page.locator('[data-backoffice-sidebar]')
  const overflow = await sidebar.evaluate((element) => {
    const content = element.querySelector('[data-slot="sidebar-content"]')
    return content ? content.scrollHeight - content.clientHeight : -1
  })
  expect(overflow).toBe(0)
})

test('a refused screen names the duty that opens it and where to ask', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      verification: { refusal: { status: 403, code: 'forbidden' }, requests: [], renewals: [] },
    }),
  )
  await page.goto('/verifications')

  const refusal = page.locator('[data-screen-refusal]')
  await expect(refusal).toBeVisible()
  await expect(refusal).toContainText('Esta pantalla pide un deber vigente')
  await expect(refusal.locator('[data-screen-duties]')).toContainText(
    'Verificar credenciales profesionales',
  )
  // The library renders a link styled as a button with the button role.
  await expect(
    refusal.getByRole('button', { name: 'Pedirlo en Equipo de Allfit One' }),
  ).toHaveAttribute('href', '/team')
  await expect(page.locator('[data-slot="alert"]')).toHaveCount(0)
})

test('the home screen says who is signed in and until when', async ({ context, page }) => {
  await mockBackofficeApi(context, createBackofficeFixture({ session: activeSession() }))
  await page.goto('/panel')

  const panel = page.locator('[data-operator-panel]')
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Ada Lovelace')
  await expect(panel).toContainText('AAL2')
  await expect(panel).toContainText('Caduca si no la usas')
  await expect(panel).toContainText('Termina a más tardar')
  await expect(panel.getByRole('link', { name: 'Equipo de Allfit One' })).toHaveAttribute(
    'href',
    '/team',
  )
})

test('a form keeps a readable measure and its button its own width', async ({ context, page }) => {
  await mockBackofficeApi(context, createBackofficeFixture({ session: activeSession() }))
  await page.goto('/people')

  const form = page.locator('form[data-backoffice-form]')
  const formBox = await form.boundingBox()
  const buttonBox = await form.getByRole('button', { name: 'Buscar' }).boundingBox()
  expect(formBox?.width).toBeLessThanOrEqual(36 * 16)
  expect(buttonBox?.width).toBeLessThan((formBox?.width ?? 0) / 2)
  const label = form.getByText('Referencia del caso')
  const input = form.getByLabel('Referencia del caso')
  const [labelBox, inputBox] = [await label.boundingBox(), await input.boundingBox()]
  // Stacked, not side by side: the control starts below its label.
  expect(inputBox?.y).toBeGreaterThan((labelBox?.y ?? 0) + (labelBox?.height ?? 0) - 1)
})
