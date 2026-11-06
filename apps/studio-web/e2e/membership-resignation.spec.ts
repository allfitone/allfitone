import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  secondActiveMembership,
} from './studio-api-mock'

/*
 * Two cards, two states, one screen. `activeMembership` is the owner — the one
 * membership that cannot be left — and `secondActiveMembership` is a coach, the
 * branch where leaving strands clients. No profile, so the account page renders
 * the memberships directly instead of behind a tab.
 */
function ownAccount() {
  return createStudioApiFixture({
    me: { profile: null, memberships: [activeMembership, secondActiveMembership] },
  })
}

function openAccount(page: Page) {
  return page.goto('/account')
}

function resignButton(page: Page) {
  return page.getByRole('button', { name: 'Renunciar a la vinculación' })
}

test('a coach resigns and the card moves to the history', async ({ page }) => {
  const fixture = ownAccount()
  await installStudioApiMock(page, fixture)
  await openAccount(page)

  await resignButton(page).click()
  await page.getByRole('button', { name: 'Renunciar ahora' }).click()

  await expect(page.getByRole('alertdialog')).toBeHidden()
  // The card is gone from the active grid and counted in the history, because
  // the screen re-read `me` instead of hiding the row it had just acted on.
  await expect(resignButton(page)).toBeHidden()
  await expect(page.getByRole('button', { name: /Historial de vinculaciones · 1/ })).toBeVisible()

  const command = fixture.requests.find(
    (request) => request.method === 'POST' && request.path.endsWith('/resignation'),
  )
  // The organization in the path and nothing else: no membership id, because
  // the command resolves it from the person in the session.
  expect(command?.path).toBe(
    `/studio/v1/organizations/${secondActiveMembership.organization_id}/me/membership/resignation`,
  )
  expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  // The contract says the request has no body, and sending one would be the
  // kind of thing an intermediary drops without telling anybody.
  expect(command?.body).toBeUndefined()
})

/*
 * Criterion 3 seen from the person leaving, and the whole reason this dialog
 * exists: they know they are going, they do not know their clients stay behind
 * with nobody attending them.
 */
test('the dialog warns that the clients stay and need reassigning', async ({ page }) => {
  await installStudioApiMock(page, ownAccount())
  await openAccount(page)

  await resignButton(page).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Las personas que atiendes')
  await expect(dialog).toContainText('sin profesional responsable')
  await expect(dialog).toContainText('reasignarlas')
  await expect(dialog).toContainText('No se termina ninguna relación ni se revoca ningún permiso')
})

/*
 * Criteria 3 and 4, the half that reassures. The notice is promised because it
 * is real: the resignation event has a worker that claims it, unlike the
 * relationship-termination one.
 */
test('the dialog promises the notice and keeps the authorship', async ({ page }) => {
  await installStudioApiMock(page, ownAccount())
  await openAccount(page)

  await resignButton(page).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Se avisa a la administración')
  await expect(dialog).toContainText('Lo que registraste se conserva, con tu nombre')
})

/*
 * Criterion 1. The owner gets the reason rather than a disabled button or
 * silence: «¿y cómo salgo de aquí?» is the question the missing control asks,
 * and the answer is not «no se puede» but «todavía no».
 */
test('the owner card explains the transfer instead of offering the action', async ({ page }) => {
  await installStudioApiMock(page, ownAccount())
  await openAccount(page)

  const ownerCard = page.locator('[data-membership-context-grid] > *', {
    hasText: activeMembership.display_name,
  })
  await expect(ownerCard).toContainText('transferir la propiedad')
  await expect(ownerCard.getByRole('button', { name: 'Renunciar a la vinculación' })).toHaveCount(0)
  // And exactly one card offers the action: the coach's.
  await expect(resignButton(page)).toHaveCount(1)
})

test('a membership that already ended offers nothing', async ({ page }) => {
  const fixture = createStudioApiFixture({
    me: {
      profile: null,
      memberships: [
        { ...secondActiveMembership, status: 'terminated', ended_at: '2026-01-10T10:00:00.000Z' },
      ],
    },
  })
  await installStudioApiMock(page, fixture)
  await openAccount(page)

  await expect(page.getByRole('button', { name: /Historial de vinculaciones · 1/ })).toBeVisible()
  await expect(resignButton(page)).toHaveCount(0)
})

/*
 * The refusal the command makes by design. Reaching it means somebody handed
 * the reader the owner role while this page was open, so the copy names the
 * transfer and tells them to refresh.
 */
test('the owner refusal keeps the dialog open and names the transfer', async ({ page }) => {
  const fixture = ownAccount()
  fixture.membershipResignationOutcome = 'rejected'
  await installStudioApiMock(page, fixture)
  await openAccount(page)

  await resignButton(page).click()
  await page.getByRole('button', { name: 'Renunciar ahora' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('No puedes renunciar todavía')
  await expect(dialog).toContainText('transferir la propiedad')
})

test('a membership somebody else closed first asks for a re-read', async ({ page }) => {
  const fixture = ownAccount()
  fixture.membershipResignationOutcome = 'gone'
  await installStudioApiMock(page, fixture)
  await openAccount(page)

  await resignButton(page).click()
  await page.getByRole('button', { name: 'Renunciar ahora' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Ya no tienes esta vinculación')
  await expect(dialog).toContainText('Actualiza')
})
