import { expect, test } from '@playwright/test'

import {
  activeMembership,
  closedHistoricalCase,
  createStudioApiFixture,
  expiredHistoricalCase,
  installStudioApiMock,
  openHistoricalCase,
  terminatedClient,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-062: reading what she had shared until the cut, through an open case.
 * Criterion 1 is the cut said on the page; 2 is a section only for what has a
 * historical read; 3 and 4 are a page with nothing to write and nobody else to
 * find; 5 is said, and every read names the case; 7 is a case that stopped serving;
 * 8 is a refused read drawn exactly like an empty one.
 */

const CASES_PATH = `/organizations/${activeMembership.organization_id}/historical-access-cases`
const READ_PATH = `${CASES_PATH}/${openHistoricalCase.id}?relationship=${terminatedClient.relationship_id}`

function withCases(overrides: Partial<StudioApiFixture> = {}) {
  return createStudioApiFixture({
    memberships: [activeMembership],
    historicalCases: structuredClone([
      openHistoricalCase,
      expiredHistoricalCase,
      closedHistoricalCase,
    ]),
    ...overrides,
  })
}

function reads(fixture: StudioApiFixture) {
  return fixture.requests.filter((request) => request.path.includes('/historical-relationships/'))
}

test('the member a case names reads her history up to the cut, from the case', async ({ page }) => {
  const fixture = withCases()
  await installStudioApiMock(page, fixture)
  await page.goto(CASES_PATH)

  // Only the open case that names this member offers the history.
  await expect(page.getByRole('link', { name: 'Consultar el historial' })).toHaveCount(1)
  await page.getByRole('link', { name: 'Consultar el historial' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Historial congelado' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Bruno Bello' })).toBeVisible()
  await expect(page.locator('[data-historical-reading-cut]')).toContainText('Hasta el corte:')
  await expect(page.locator('[data-historical-reading-record]')).toContainText(
    'Cada consulta queda registrada con este caso',
  )

  const sessions = page.locator('[data-historical-reading-section="sessions"]')
  await expect(sessions.locator('[data-historical-entry]')).toHaveCount(2)
  await expect(sessions).toContainText('Con nosotros')
  await expect(sessions).toContainText('Por su cuenta')

  const body = page.locator('[data-historical-reading-section="body"]')
  await expect(body).toContainText('72,5 kg (registró 159,8 lb)')
  // A field the frozen version does not keep is left out, not explained.
  await expect(body.locator('[data-historical-entry]').nth(1)).toContainText('Cintura')
  await expect(body.locator('[data-historical-entry]').nth(1)).not.toContainText(/sin dato|oculto/i)

  const goals = page.locator('[data-historical-reading-section="nutrition"]')
  await expect(goals).toContainText('Proteína: al menos 120 g')
  await expect(goals).toContainText(/Energía: 2\.100 kcal/)
  await expect(goals).toContainText('Lo aceptó el')

  // Criterion 5: every read went through this case.
  expect(reads(fixture).length).toBe(4)
  for (const request of reads(fixture)) {
    expect(request.headers['x-historical-access-case']).toBe(openHistoricalCase.id)
  }
})

test('criterion 2: a frozen category with no historical read is no section at all', async ({
  page,
}) => {
  const fixture = withCases()
  fixture.historicalRelationship = {
    ...fixture.historicalRelationship,
    scopes: [
      { code: 'body_progress', version: 1, frozen_at: terminatedClient.ended_at },
      { code: 'health_context', version: 1, frozen_at: terminatedClient.ended_at },
    ],
  }
  await installStudioApiMock(page, fixture)
  await page.goto(READ_PATH)

  await expect(page.locator('[data-historical-reading-section="body"]')).toBeVisible()
  await expect(page.locator('[data-historical-reading-section]')).toHaveCount(1)
  await expect(page.locator('[data-historical-reading]')).not.toContainText(/salud/i)
  expect(reads(fixture).map((request) => request.path.split('/').at(-1))).toEqual([
    terminatedClient.relationship_id,
    'body-progress',
  ])
})

test('criterion 8: a read refused and a read that found nothing look the same', async ({
  page,
}) => {
  const fixture = withCases({ frozenRefused: ['body-progress'], frozenGoalVersions: [] })
  await installStudioApiMock(page, fixture)
  await page.goto(READ_PATH)

  const refused = page.locator('[data-historical-reading-section="body"]')
  const empty = page.locator('[data-historical-reading-section="nutrition"]')
  await expect(refused.locator('[data-historical-reading-nothing]')).toBeVisible()
  await expect(empty.locator('[data-historical-reading-nothing]')).toBeVisible()
  await expect(refused.locator('[data-historical-reading-nothing]')).toHaveText(
    (await empty.locator('[data-historical-reading-nothing]').textContent()) ?? '',
  )
  for (const section of [refused, empty]) {
    await expect(section).not.toContainText(/autoriz|permiso|vac[ií]o|oculto/i)
  }
})

test('criteria 3 and 4: nothing to write, export or search for', async ({ page }) => {
  await installStudioApiMock(page, withCases())
  await page.goto(READ_PATH)
  await expect(page.locator('[data-historical-reading-section="sessions"]')).toBeVisible()

  const reading = page.locator('[data-historical-reading]')
  await expect(reading.getByRole('textbox')).toHaveCount(0)
  await expect(reading.getByRole('searchbox')).toHaveCount(0)
  await expect(
    reading.getByRole('button', { name: /registrar|corregir|observar|exportar|descargar/i }),
  ).toHaveCount(0)
})

test('an old sign-in asks to sign in again, and coming back reads the same case', async ({
  page,
}) => {
  const fixture = withCases({ historicalReadOutcome: 'reauthenticate' })
  fixture.intercept = (request) => {
    if (request.method !== 'GET' || request.path !== '/studio/v1/auth/start') return undefined
    fixture.historicalReadOutcome = 'ok'
    return { status: 302, headers: { Location: new URL('/app', page.url()).toString() } }
  }
  await installStudioApiMock(page, fixture)
  await page.goto(READ_PATH)

  const ask = page.locator('[data-historical-reading-reauthenticate]')
  await expect(ask).toContainText('Vuelve a iniciar sesión para consultar')
  await ask.getByRole('button', { name: 'Iniciar sesión de nuevo' }).click()

  await expect(page).toHaveURL(READ_PATH)
  await expect(page.locator('[data-historical-reading-section="sessions"]')).toBeVisible()
})

test('criterion 7: a case that stopped serving reads nothing, whatever the reason', async ({
  page,
}) => {
  const fixture = withCases()
  await installStudioApiMock(page, fixture)
  // The expired case, and the closed one that names somebody else.
  for (const entry of [expiredHistoricalCase, closedHistoricalCase]) {
    await page.goto(`${CASES_PATH}/${entry.id}?relationship=${entry.relationship_id}`)
    await expect(page.locator('[data-historical-reading-gone]')).toContainText(
      'Este caso ya no deja consultar nada',
    )
    await expect(page.locator('[data-historical-reading-section]')).toHaveCount(0)
  }
})

test('HU-061 criterion 1: managing cases reads nothing a case does not name', async ({ page }) => {
  // The owner opened it, for the coach who held Bruno: the owner gets no way in.
  const fixture = withCases({
    historicalCases: [{ ...openHistoricalCase, authorized: closedHistoricalCase.authorized }],
  })
  await installStudioApiMock(page, fixture)
  await page.goto(CASES_PATH)

  await expect(page.locator('[data-historical-case]')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Consultar el historial' })).toHaveCount(0)
  expect(reads(fixture)).toHaveLength(0)
})
