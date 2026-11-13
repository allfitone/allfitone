import { expect, test } from '@playwright/test'

import {
  activeMembership,
  closedHistoricalCase,
  createStudioApiFixture,
  expiredHistoricalCase,
  installStudioApiMock,
  openHistoricalCase,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-063: closing a case. Criterion 1 is the expired case, said as the
 * deadline and never as an error; 2 and 3 are said in the dialog before the click,
 * and 3 is also a closed case that offers nothing to reopen.
 */

const CASES_PATH = `/organizations/${activeMembership.organization_id}/historical-access-cases`

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

function closures(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/closure'),
  )
}

const openRow = (page: import('@playwright/test').Page) =>
  page.locator('[data-historical-case][data-historical-case-state="open"]')

test('an owner closes an open case, and it reads nothing from then on', async ({ page }) => {
  const fixture = withCases()
  await installStudioApiMock(page, fixture)
  await page.goto(CASES_PATH)

  await openRow(page).getByRole('button', { name: 'Cerrar el caso' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('¿Cerrar el caso sobre Bruno Bello?')
  // Criteria 2 and 3, before the click.
  await expect(dialog).toContainText('No se borra ningún registro')
  await expect(dialog).toContainText('Un caso cerrado no se reabre')
  await expect(dialog).toContainText('su propia justificación')
  await dialog.getByRole('button', { name: 'Cerrar ahora' }).click()

  await expect(page.locator('[data-historical-cases-outcome]')).toContainText(
    'Cerraste el caso sobre Bruno Bello. Ya no deja consultar nada.',
  )
  const first = page.locator('[data-historical-case]').first()
  await expect(first).toHaveAttribute('data-historical-case-state', 'closed')
  await expect(first).toContainText('Lo cerró Ada Lovelace.')
  await expect(page.getByRole('link', { name: 'Consultar el historial' })).toHaveCount(0)

  expect(closures(fixture)).toHaveLength(1)
  const [sent] = closures(fixture)
  expect(sent?.path).toContain(openHistoricalCase.id)
  expect(sent?.body).toBeUndefined()
  expect(sent?.headers['idempotency-key']).toBeTruthy()
})

test('keeping it open sends nothing', async ({ page }) => {
  const fixture = withCases()
  await installStudioApiMock(page, fixture)
  await page.goto(CASES_PATH)

  await openRow(page).getByRole('button', { name: 'Cerrar el caso' }).click()
  await page.getByRole('button', { name: 'Mantenerlo abierto' }).click()

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(openRow(page)).toContainText('Abierto')
  expect(closures(fixture)).toHaveLength(0)
})

test('criterion 1: an expired case is the deadline at work, not an error', async ({ page }) => {
  await installStudioApiMock(page, withCases())
  await page.goto(CASES_PATH)

  const expired = page.locator('[data-historical-case][data-historical-case-state="expired"]')
  await expect(expired).toContainText('Vencido')
  await expect(expired).toContainText('Se cumplió el plazo: ya no deja consultar nada.')
  await expect(expired.getByRole('button')).toHaveCount(0)
  await expect(expired.getByRole('link')).toHaveCount(0)
  await expect(page.locator('[data-historical-cases-screen] [role="alert"]')).toHaveCount(0)
})

test('criterion 3: a closed case offers nothing to reopen', async ({ page }) => {
  await installStudioApiMock(page, withCases())
  await page.goto(CASES_PATH)

  const closed = page.locator('[data-historical-case][data-historical-case-state="closed"]')
  await expect(closed).toContainText('Lo cerró Ada Lovelace.')
  await expect(closed.getByRole('button')).toHaveCount(0)
  await expect(closed.getByRole('link')).toHaveCount(0)
  // A new case is the way back, with its own justification.
  await expect(page.getByRole('link', { name: 'Abrir un caso' })).toBeVisible()
})

test('a case closed for her, or for the member it named, says so', async ({ page }) => {
  await installStudioApiMock(
    page,
    withCases({
      historicalCases: [
        { ...closedHistoricalCase, closed_reason: 'grant_revoked', closed_by: null },
        {
          ...closedHistoricalCase,
          id: '01991600-7000-7000-8000-0000000000c4',
          closed_reason: 'membership_ineligible',
          closed_by: null,
        },
      ],
    }),
  )
  await page.goto(CASES_PATH)

  const rows = page.locator('[data-historical-case]')
  await expect(rows.nth(0)).toContainText('la persona retiró el permiso congelado')
  await expect(rows.nth(1)).toContainText('Diana Entrante dejó de poder recibirlo')
})

test('only a role that manages cases closes one', async ({ page }) => {
  // A coach the case names reads it, and cannot close it.
  const fixture = withCases({
    memberships: [{ ...activeMembership, roles: ['coach'] }],
    historicalCases: [structuredClone(openHistoricalCase)],
  })
  await installStudioApiMock(page, fixture)
  await page.goto(CASES_PATH)

  await expect(page.getByRole('link', { name: 'Consultar el historial' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cerrar el caso' })).toHaveCount(0)
})

test('a refusal is said inside the dialog, and the case stays open', async ({ page }) => {
  const fixture = withCases({ historicalCloseOutcome: 'forbidden' })
  await installStudioApiMock(page, fixture)
  await page.goto(CASES_PATH)

  await openRow(page).getByRole('button', { name: 'Cerrar el caso' }).click()
  await page.getByRole('button', { name: 'Cerrar ahora' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog.locator('[data-historical-case-close-error]')).toContainText('No se cerró')
  await expect(dialog).toContainText('Tu rol ya no cierra casos')
  await dialog.getByRole('button', { name: 'Mantenerlo abierto' }).click()
  await expect(openRow(page)).toHaveCount(1)
})
