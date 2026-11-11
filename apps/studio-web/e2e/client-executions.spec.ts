import { expect, test } from '@playwright/test'

import {
  clientCard,
  clientExecutions,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
} from './studio-api-mock'

/**
 * HU-STUDIO-054 — the sessions a client shares with the coach who attends her.
 *
 * The narrowing is the row policy's: a session she hid never reaches a page, and
 * one from another relationship is never answered. What is checked here is the
 * half the screen owns — that it shows the hour she trained at, that it says
 * whose each session was, that it never invents a total, and that an empty list
 * is not blamed on her.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const CARD = `/organizations/${ORG}/clients/people/${PERSON}`
const EXECUTIONS = `${CARD}/executions`

test.beforeEach(async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
})

test('lists her sessions newest first, with what each one was', async ({ page }) => {
  await page.goto(EXECUTIONS)

  await expect(page.getByRole('heading', { level: 1, name: 'Sesiones ejecutadas' })).toBeVisible()
  const rows = page.locator('[data-client-execution]')
  // One page, not the whole list: the pager has to be pressed for the rest.
  await expect(rows).toHaveCount(25)
  await expect(rows.first()).toContainText('Entrenamiento de fuerza')
  await expect(rows.first()).toContainText('28/07/2026')
})

/*
 * Criterion 1 made visible. The list mixes two categories in one stream, so each
 * row has to say which one it came from — a coach reading his own programme
 * needs to know which sessions were his.
 */
test('says whose each session was', async ({ page }) => {
  await page.goto(EXECUTIONS)
  const rows = page.locator('[data-client-execution]')

  await expect(rows.nth(0)).toContainText('Con nosotros')
  await expect(rows.nth(0)).toContainText('Cumplió una sesión que le asignamos')

  await expect(rows.nth(1)).toContainText('Por su cuenta')
  await expect(rows.nth(1)).toContainText('Carrera')
  // Only a session of this relationship can carry a plan of ours.
  await expect(rows.nth(1)).not.toContainText('Cumplió una sesión')
})

/*
 * The hour she lived, not the hour the reader would have read it at. The fixture
 * has one session trained in Madrid at 06:15, which is 23:15 of the day before
 * in Bogotá — the browser running this suite is on Bogotá time.
 */
test('shows the hour she trained at, in the zone where she trained', async ({ page }) => {
  await page.goto(EXECUTIONS)

  const madrid = page.locator('[data-client-execution]').filter({ hasText: 'Europe/Madrid' })
  await expect(madrid).toHaveCount(1)
  await expect(madrid).toContainText('6:15')
  await expect(madrid).toContainText('24/07/2026')
})

test('says nothing it cannot support about a session', async ({ page }) => {
  await page.goto(EXECUTIONS)
  const rows = page.locator('[data-client-execution]')

  // Nobody closed it, so no duration — and not «0 min».
  const unclosed = rows.nth(2)
  await expect(unclosed).toContainText('26/07/2026')
  await expect(unclosed).not.toContainText('Duración')

  // No completeness level recorded, which must not read as «Registro parcial».
  const unlevelled = rows.nth(3)
  await expect(unlevelled).toContainText('25/07/2026')
  await expect(unlevelled).not.toContainText('Registro')
})

/*
 * Criterion 3 and 4 together. The page carries no total, so the screen must not
 * build one: a figure counted from a page would be wrong twice, and a session she
 * hid must not show up as a difference in any count.
 */
test('shows no total, anywhere', async ({ page }) => {
  await page.goto(EXECUTIONS)
  await expect(page.locator('[data-client-execution]')).toHaveCount(25)

  await expect(page.getByText(/\b25 sesiones\b|\b30 sesiones\b/)).toHaveCount(0)
  await expect(page.getByText(/\bde 30\b|\bTotal\b/)).toHaveCount(0)
  // The panel says why there is none, and that sentence is the only «totales».
  await expect(page.getByText('no lleva totales')).toBeVisible()
})

test('the rest of the list arrives when somebody asks for it', async ({ page }) => {
  await page.goto(EXECUTIONS)
  await expect(page.locator('[data-client-execution]')).toHaveCount(25)

  await page.getByRole('button', { name: 'Ver más' }).click()
  await expect(page.locator('[data-client-execution]')).toHaveCount(30)
  // Nothing left to ask for, so nothing offers to.
  await expect(page.getByRole('button', { name: 'Ver más' })).toHaveCount(0)
})

/*
 * Each page is a read recorded for her to see, so the screen asks on arrival and
 * when the pager is pressed — never because a window regained focus. An infinite
 * query refetches every page it holds, which would have multiplied it.
 */
test('asks once per page and never again on its own', async ({ page }) => {
  const reads: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/studio/v1/') && pathname.endsWith('/executions')) {
      reads.push(request.url())
    }
  })

  await page.goto(EXECUTIONS)
  await expect(page.locator('[data-client-execution]')).toHaveCount(25)
  expect(reads).toHaveLength(1)

  await page.getByRole('button', { name: 'Ver más' }).click()
  await expect(page.locator('[data-client-execution]')).toHaveCount(30)
  expect(reads).toHaveLength(2)

  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('[data-client-execution]')).toHaveCount(30)
  expect(reads).toHaveLength(2)
})

/*
 * Criterion 5. An empty page is the answer both for a person who trained nothing
 * and for one who shares neither category, so the screen offers both readings
 * and picks neither.
 */
test('an empty list is not blamed on her', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientExecutions: [] }),
  )
  await page.goto(EXECUTIONS)

  await expect(page.getByText('No hay sesiones que podamos mostrarte')).toBeVisible()
  await expect(page.getByText('todavía no haya entrenado')).toBeVisible()
  await expect(page.getByText('no se puede distinguir')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver más' })).toHaveCount(0)
})

test('a cursor the server will not read again starts the list over', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], executionsCursor: 'stale' }),
  )
  await page.goto(EXECUTIONS)
  await expect(page.locator('[data-client-execution]')).toHaveCount(25)

  await page.getByRole('button', { name: 'Ver más' }).click()

  await expect(page.getByText('La lista cambió mientras la leías')).toBeVisible()
  // The pager is withdrawn: pressing it again would refuse again.
  await expect(page.getByRole('button', { name: 'Ver más' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Empezar de nuevo' })).toBeVisible()
})

test('a person the caller does not attend has no sessions to open', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: null }),
  )
  await page.goto(EXECUTIONS)

  await expect(page.getByText('No encontramos estas sesiones')).toBeVisible()
})

/*
 * The card is the way in, and the sessions screen is named by two categories, so
 * the door is offered once — on the first of them, never twice.
 */
test('is opened from the card, once, however many categories feed it', async ({ page }) => {
  await page.goto(CARD)
  await expect(page.getByRole('heading', { name: 'Entrenamiento con nosotros' })).toBeVisible()

  const doors = page.locator('[data-client-card-door="listAuthorizedClientExecutions"]')
  await expect(doors).toHaveCount(1)

  await doors.click()
  await expect(page).toHaveURL(new RegExp(`${PERSON}/executions$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Sesiones ejecutadas' })).toBeVisible()

  await page.getByRole('link', { name: 'Volver a su ficha' }).click()
  await expect(page).toHaveURL(new RegExp(`people/${PERSON}$`))
})

test('the fixture is paged, so the whole list is longer than one page', async ({ page }) => {
  // Guards the fixture itself: a list of 25 or fewer would never press the pager.
  expect(clientExecutions.length).toBeGreaterThan(25)
  await page.goto(EXECUTIONS)
  await expect(page.getByRole('button', { name: 'Ver más' })).toBeVisible()
})
