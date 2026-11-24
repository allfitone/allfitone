import { expect, test, type Page } from '@playwright/test'

import {
  SUPPORT_SUBJECT_ID,
  SUPPORT_SUBJECT_NAME,
  activeSession,
  createBackofficeFixture,
  handoverRecord,
  mockBackofficeApi,
  organizationFileRecord,
  supportPerson,
} from './backoffice-api-mock'

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
  await expect(page).toHaveTitle('Reglas de resultados | Allfit Backoffice')

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

  // The shell's header: the screen's content opens with a header of its own.
  const header = page.locator('[data-backoffice-header]')
  await expect(header).toContainText('Seguridad y privacidad')
  await expect(header.getByRole('heading', { level: 1 })).toHaveText('Solicitudes de eliminación')

  // Fourteen entries and three labels have to fit above the operator's name.
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
  // The assurance in words: «AAL2» is the name of a standard, not of what happened.
  await expect(panel).toContainText('Dos factores')
  await expect(panel).not.toContainText('AAL2')
  await expect(panel).toContainText('Caduca si no la usas')
  await expect(panel).toContainText('Termina a más tardar')
  await expect(panel.getByRole('link', { name: 'Equipo de Allfit One' })).toHaveAttribute(
    'href',
    '/team',
  )
})

test('a form keeps a readable measure and its button its own width', async ({ context, page }) => {
  await mockBackofficeApi(context, createBackofficeFixture({ session: activeSession() }))
  // Personas became a toolbar; the follow-up keeps the stacked form this rule is for.
  await page.goto('/people/billing')

  const form = page.locator('form[data-backoffice-form]')
  const formBox = await form.boundingBox()
  const buttonBox = await form.getByRole('button', { name: 'Ver la lista' }).boundingBox()
  expect(formBox?.width).toBeLessThanOrEqual(36 * 16)
  expect(buttonBox?.width).toBeLessThan((formBox?.width ?? 0) / 2)
  const label = form.getByText('Referencia del caso')
  const input = form.getByLabel('Referencia del caso')
  const [labelBox, inputBox] = [await label.boundingBox(), await input.boundingBox()]
  // Stacked, not side by side: the control starts below its label.
  expect(inputBox?.y).toBeGreaterThan((labelBox?.y ?? 0) + (labelBox?.height ?? 0) - 1)
})

/** The links of the workspace content that do not reach 4.5:1 against what they sit on. */
function unreadableLinks(page: Page) {
  return page.evaluate(() => {
    const channels = (color: string): number[] => (color.match(/[\d.]+/g) ?? []).map(Number)
    const linear = (channel: number): number => {
      const value = channel / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }
    const luminance = ([r = 0, g = 0, b = 0]: number[]): number =>
      0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    // The first painted ancestor is the surface the link is read on.
    const surface = (element: Element): number[] => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const color = channels(getComputedStyle(node).backgroundColor)
        if (color.length >= 3 && (color[3] ?? 1) > 0) return color
      }
      return [255, 255, 255]
    }
    return [...document.querySelectorAll('[data-backoffice-content] a:not([data-slot])')]
      .filter((link) => link.getClientRects().length > 0)
      .map((link) => {
        const [lighter, darker] = [
          luminance(channels(getComputedStyle(link).color)),
          luminance(surface(link)),
        ].sort((a, b) => b - a)
        return {
          name: link.textContent?.trim() ?? '',
          ratio: ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05),
        }
      })
      .filter((link) => link.ratio < 4.5)
      .map((link) => `${link.name}: ${link.ratio.toFixed(2)}:1`)
  })
}

/*
 * A link left to the browser is #0000EE, 1.97:1 on a card here. Links were styled
 * one data attribute at a time, and six kinds had none, among them the name that
 * opens a person's card and the way to ask for an exceptional access.
 */
test('every link on a workspace screen reads against what it sits on', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), support: { people: [supportPerson()] } }),
  )
  await page.goto('/people')
  await page.getByLabel('Nombre, correo o teléfono').fill('epsi')
  await page.getByLabel('Referencia del caso (opcional)').fill('CASE-2026-001')
  await page.getByRole('button', { name: 'Buscar' }).click()
  const found = page.getByRole('link', { name: SUPPORT_SUBJECT_NAME })
  await expect(found).toBeVisible()
  expect(await unreadableLinks(page)).toEqual([])

  await found.click()
  await expect(page.locator('[data-person-break-glass-link]')).toBeVisible()
  expect(await unreadableLinks(page)).toEqual([])
})

/** Stacked blocks with less than 8px between them, in a screen root or a card body. */
function touchingBlocks(page: Page) {
  return page.evaluate(() => {
    const label = (element: Element): string => {
      const slot = element.getAttribute('data-slot')
      const own = [...element.attributes].find(
        (attribute) => attribute.name.startsWith('data-') && attribute.name !== 'data-slot',
      )
      return own?.name ?? slot ?? element.tagName.toLowerCase()
    }
    // A Design System component spaces its own parts; the app owns the space between blocks.
    const containers = [
      ...document.querySelectorAll('[data-backoffice-content] > :not([data-slot])'),
      ...document.querySelectorAll('[data-backoffice-content] [data-slot="card-content"]'),
    ]
    const found: string[] = []
    for (const container of containers) {
      const blocks = [...container.children].filter((child) => child.getClientRects().length > 0)
      blocks.forEach((below, index) => {
        const above = blocks[index - 1]
        if (!above) return
        const [top, bottom] = [
          below.getBoundingClientRect().top,
          above.getBoundingClientRect().bottom,
        ]
        if (top >= bottom - 1 && top - bottom < 8) {
          found.push(`${label(container)}: ${label(above)} → ${label(below)}`)
        }
      })
    }
    return found
  })
}

/*
 * Ten screen roots had no layout rule, so their cards touched — the gym's file
 * read as one wall of nine cards — and a card body stacks its children with no
 * space at all: a nested card sat flush against the table above it.
 */
test('every screen keeps its blocks apart, and every card its contents', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), support: { people: [supportPerson()] } }),
  )
  const touching: string[] = []
  const screens = [
    '/panel',
    '/organizations',
    '/organizations/019a9999-0000-7000-8000-000000000000',
    '/diagnosis',
    '/plans',
    '/waitlist',
    '/verifications',
    '/catalogue',
    '/catalogue/result-contracts',
    '/team',
    '/access-log',
    '/break-glass',
    '/erasure-requests',
    '/permissions',
    '/people/billing',
  ]
  for (const screen of screens) {
    await page.goto(screen)
    await expect(page.locator('[data-backoffice-content]')).toBeVisible()
    await expect(page.locator('[data-backoffice-content] [role="status"][aria-label]')).toHaveCount(
      0,
    )
    touching.push(...(await touchingBlocks(page)).map((block) => `${screen} ${block}`))
  }

  await page.goto('/people')
  await page.getByLabel('Nombre, correo o teléfono').fill('epsi')
  await page.getByLabel('Referencia del caso (opcional)').fill('CASE-2026-001')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: SUPPORT_SUBJECT_NAME }).click()
  await expect(page.locator('[data-person-break-glass-link]')).toBeVisible()
  touching.push(...(await touchingBlocks(page)).map((block) => `card ${block}`))

  expect(touching).toEqual([])
})

/*
 * A screen below a menu entry used to keep the entry's title: the `h1` said
 * «Gimnasios» over a gym's file, and the way back was a link at the foot of the
 * page. Each one now names what is open and starts with the way back to its list.
 */
test('every screen below a menu entry names what is open and leads back to its list', async ({
  context,
  page,
}) => {
  const file = organizationFileRecord()
  const handover = handoverRecord()
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      organizationFiles: { files: [file] },
      organizationHandover: { handovers: [handover] },
      support: { people: [supportPerson()] },
    }),
  )

  const screens = [
    {
      path: `/organizations/${file.organization.organization_id}`,
      name: file.organization.display_name,
      back: { title: 'Gimnasios', href: '/organizations' },
    },
    // A handover is a tab of its gym's file, under the gym's name.
    {
      path: `/organizations/${handover.organization_id}?tab=handover`,
      name: handover.display_name,
      back: { title: 'Gimnasios', href: '/organizations' },
    },
    // The way back keeps the case, so the search it leads to records against it too.
    {
      path: `/people/${SUPPORT_SUBJECT_ID}?case_reference=CASE-2026-001`,
      name: SUPPORT_SUBJECT_NAME,
      back: { title: 'Personas', href: '/people?case_reference=CASE-2026-001' },
    },
    {
      path: '/people/billing',
      name: 'Cobros por seguir',
      back: { title: 'Personas', href: '/people' },
    },
  ]

  for (const screen of screens) {
    await page.goto(screen.path)
    const content = page.locator('[data-backoffice-content]')
    await expect(content.getByRole('heading', { level: 2, name: screen.name })).toBeVisible()
    const trail = content.getByRole('navigation', { name: 'Ruta' })
    await expect(trail.getByRole('link', { name: screen.back.title })).toHaveAttribute(
      'href',
      screen.back.href,
    )
    // Nothing above the way back: it is the first thing the screen shows.
    const firstTop = await content.evaluate((element) =>
      Math.min(...[...element.children].map((child) => child.getBoundingClientRect().top)),
    )
    expect((await trail.boundingBox())?.y).toBeCloseTo(firstTop, 0)
  }

  await page.goto(`/organizations/${file.organization.organization_id}`)
  await page
    .getByRole('navigation', { name: 'Ruta' })
    .getByRole('link', { name: 'Gimnasios' })
    .click()
  await expect(page).toHaveURL('/organizations')
})
