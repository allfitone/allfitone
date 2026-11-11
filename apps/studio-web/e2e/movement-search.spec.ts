import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  problem,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-067: searching the global library and the gym's own at once. The
 * server owns all three criteria — nothing of another gym, names and other
 * names, archived only on request — so this audits that the screen sends each
 * filter, tells the two libraries apart, and marks what is archived.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`

async function openMovements(page: Page) {
  await page.goto(CONTENT_PATH)
  await page.getByRole('tab', { name: 'Movimientos' }).click()
}

function results(page: Page) {
  return page.getByRole('list', { name: 'Movimientos' })
}

function searches(fixture: StudioApiFixture) {
  return fixture.requests
    .filter((request) => request.method === 'GET' && request.path.endsWith('/movements'))
    .map((request) => new URLSearchParams(request.search))
}

test('the library and the gym’s own are one list, and each says whose it is', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openMovements(page)

  const global = results(page).locator('li', { hasText: 'Sentadilla trasera' })
  const own = results(page).locator('li', { hasText: 'Remo con mancuerna a una mano' })
  await expect(global).toContainText('Catálogo de Allfit')
  await expect(global).toContainText('Fuerza')
  await expect(own).toContainText('Propio')
})

test('an archived movement stays out until it is asked for, and then says so', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await openMovements(page)

  await expect(results(page).locator('li', { hasText: 'Press de banca' })).toBeVisible()
  await expect(results(page).locator('li', { hasText: 'Zancada lateral con banda' })).toHaveCount(0)

  await page.getByRole('checkbox', { name: 'Incluir los archivados' }).click()

  const archived = results(page).locator('li', { hasText: 'Zancada lateral con banda' })
  await expect(archived).toContainText('Archivado')
  expect(searches(fixture).at(-1)?.get('include_archived')).toBe('true')
})

test('another name finds the movement it belongs to', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await openMovements(page)

  await page.getByLabel('Buscar un movimiento').fill('bench')

  await expect(results(page).locator('li')).toHaveCount(1)
  await expect(results(page)).toContainText('Press de banca')
  expect(searches(fixture).at(-1)?.get('q')).toBe('bench')
})

test('the discipline narrows the search on the server', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await openMovements(page)

  await page.getByLabel('Disciplina').click()
  await page.getByRole('option', { name: 'Movilidad' }).click()

  await expect(results(page).locator('li')).toHaveCount(1)
  await expect(results(page)).toContainText('Rotación torácica')
  expect(searches(fixture).at(-1)?.get('discipline')).toBe('mobility')
})

test('a search that finds nothing names the term and that accents count', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openMovements(page)

  await page.getByLabel('Buscar un movimiento').fill('rotacion')

  await expect(page.getByText('Ningún movimiento coincide con «rotacion»')).toBeVisible()
  await expect(page.getByText(/distingue las tildes/)).toBeVisible()
})

test('a long library arrives a page at a time', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.movements = Array.from({ length: 30 }, (_, index) => ({
    movement: {
      id: `01991600-c100-7000-8000-${String(index).padStart(12, '0')}`,
      discipline_code: 'strength',
      name: `Movimiento ${String(index + 1).padStart(2, '0')}`,
      scope: 'global',
      archived: false,
      muscles: [],
      equipment: [],
      demo_url: null,
    },
    aliases: [],
  }))
  await installStudioApiMock(page, fixture)
  await openMovements(page)

  await expect(results(page).locator('li')).toHaveCount(25)
  await page.getByRole('button', { name: 'Ver más' }).click()
  await expect(results(page).locator('li')).toHaveCount(30)
  await expect(page.getByRole('button', { name: 'Ver más' })).toHaveCount(0)
})

test('a failed search shows nothing rather than an empty library', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.intercept = (request) =>
    request.path.endsWith('/movements')
      ? { status: 503, body: problem('upstream-unavailable', 503) }
      : undefined
  await installStudioApiMock(page, fixture)
  await openMovements(page)

  await expect(page.getByText('No pudimos buscar los movimientos')).toBeVisible()
  await expect(results(page)).toHaveCount(0)
})
