import { expect, test, type Locator, type Page } from '@playwright/test'

import { activeSession, createBackofficeFixture, mockBackofficeApi } from './backoffice-api-mock'

/**
 * The chrome every Backoffice screen shares. Each check here is a defect that
 * reached production because nothing looked at the page in a browser: buttons
 * painted with the browser's own grey face under near-white text, an analytics
 * notice opened over the navigation, and two navigation entries lit at once.
 */

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/**
 * Whether a click at the element's centre reaches it rather than something laid
 * over it. `text` measures the words instead: a heading's box spans the header.
 */
function reachable(locator: Locator, measure: 'box' | 'text' = 'box'): Promise<boolean> {
  return locator.evaluate((element, by) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const box = by === 'text' ? range.getBoundingClientRect() : element.getBoundingClientRect()
    const topmost = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return topmost === element || element.contains(topmost)
  }, measure)
}

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
 * The notice is open until the operator answers it, on every screen. It may cover
 * neither the credential entry nor the navigation and screen title, so neither
 * waits on a question about optional analytics.
 */
const CONSENT_VIEWPORTS = [
  { name: 'wide', width: 1920, height: 889 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'tablet', width: 768, height: 1024 },
]

for (const viewport of CONSENT_VIEWPORTS) {
  test(`the analytics notice leaves sign-in reachable at ${viewport.name}`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await mockBackofficeApi(context, createBackofficeFixture(), { consent: 'undecided' })
    await page.goto('/')
    await expect(page.getByText('Analítica opcional')).toBeVisible()

    // Not one corner of the form panel: a centred notice clipped its heading at 1280 and 1440.
    const heading = page.getByRole('heading', { name: 'Identifica tu acceso.' })
    await expect(heading).toBeVisible()
    const notice = await page.locator('[data-analytics-controls]').boundingBox()
    const form = await page
      .locator('[data-slot="access-panel"]')
      .filter({ has: heading })
      .boundingBox()
    expect(notice && form).toBeTruthy()
    if (notice && form) {
      const apart =
        notice.x + notice.width <= form.x ||
        form.x + form.width <= notice.x ||
        notice.y + notice.height <= form.y ||
        form.y + form.height <= notice.y
      expect(apart, 'the notice overlaps the sign-in form').toBe(true)
    }

    for (const control of [
      page.getByRole('heading', { name: 'Identifica tu acceso.' }),
      page.getByLabel('Correo'),
      page.getByLabel('Contraseña'),
      page.getByRole('button', { name: 'Continuar con autenticador' }),
    ]) {
      await control.scrollIntoViewIfNeeded()
      expect(await reachable(control), `the notice is covering ${control}`).toBe(true)
    }
  })

  test(`the analytics notice leaves the navigation reachable at ${viewport.name}`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await mockBackofficeApi(context, createBackofficeFixture({ session: activeSession() }), {
      consent: 'undecided',
    })
    // The longest screen title in the menu, so the widest one the notice must clear.
    await page.goto('/erasure-requests')
    await expect(page.getByText('Analítica opcional')).toBeVisible()

    const trigger = page.getByRole('button', { name: 'Abrir o cerrar navegación' })
    expect(await reachable(trigger), 'the notice is covering the navigation toggle').toBe(true)
    expect(
      await reachable(
        page.getByRole('heading', { name: 'Solicitudes de eliminación', level: 1 }),
        'text',
      ),
      'the notice is covering the screen title',
    ).toBe(true)
    const covered: string[] = []
    for (const link of await page.locator('[data-backoffice-sidebar]').getByRole('link').all()) {
      // At 720px the menu scrolls; an entry below its fold is not "covered".
      await link.scrollIntoViewIfNeeded()
      if (!(await reachable(link))) covered.push((await link.textContent()) ?? '')
    }
    expect(covered, 'the notice is covering navigation entries').toEqual([])

    // Whatever sits at the end of a screen can still scroll up clear of the notice.
    const notice = await page.locator('[data-analytics-controls]').boundingBox()
    const room = await page
      .locator('[data-backoffice-content]')
      .evaluate((content) => Number.parseFloat(getComputedStyle(content).paddingBottom))
    expect(notice).not.toBeNull()
    expect(room).toBeGreaterThan(viewport.height - (notice?.y ?? viewport.height))
  })
}

// Folded, the control still sat over «Otorgar deber» at the end of «Equipo de Allfit One».
test('the folded privacy control leaves room at the end of a screen', async ({ context, page }) => {
  await mockBackofficeApi(context, createBackofficeFixture({ session: activeSession() }))
  await page.goto('/team')
  const folded = page.getByRole('button', { name: 'Privacidad' })
  await expect(folded).toBeVisible()

  const control = await page.locator('[data-analytics-controls]').boundingBox()
  const room = await page
    .locator('[data-backoffice-content]')
    .evaluate((content) => Number.parseFloat(getComputedStyle(content).paddingBottom))
  const viewport = page.viewportSize()
  expect(control && viewport).toBeTruthy()
  if (control && viewport) expect(room).toBeGreaterThan(viewport.height - control.y)
})

/*
 * The notice once set cyan text on a pale surface, about 1.4:1. Every line in it,
 * the link and the outline answer must read at 4.5:1 against the panel.
 */
test('the analytics notice is legible', async ({ context, page }) => {
  await mockBackofficeApi(context, createBackofficeFixture(), { consent: 'undecided' })
  await page.goto('/')
  await expect(page.getByText('Analítica opcional')).toBeVisible()

  const contrasts = await page.locator('[data-analytics-panel]').evaluate((panel) => {
    const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    if (!canvas) throw new Error('no 2d canvas')
    // The canvas resolves any CSS colour syntax (oklch, color-mix) to sRGB bytes.
    const channels = (color: string) => {
      canvas.clearRect(0, 0, 1, 1)
      canvas.fillStyle = color
      canvas.fillRect(0, 0, 1, 1)
      return [...canvas.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    const luminance = (color: string) => {
      const [r = 0, g = 0, b = 0] = channels(color).map((value) => {
        const unit = value / 255
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const surface = luminance(getComputedStyle(panel).backgroundColor)
    const parts = panel.querySelectorAll('strong, p, a, button[data-variant="outline"]')
    return [...parts].map((part) => {
      const text = luminance(getComputedStyle(part).color)
      const [light, dark] = text > surface ? [text, surface] : [surface, text]
      return { text: part.textContent?.trim() ?? '', ratio: (light + 0.05) / (dark + 0.05) }
    })
  })

  expect(contrasts.length).toBeGreaterThanOrEqual(4)
  for (const { text, ratio } of contrasts) {
    expect(ratio, `"${text}" against the notice`).toBeGreaterThanOrEqual(4.5)
  }
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
