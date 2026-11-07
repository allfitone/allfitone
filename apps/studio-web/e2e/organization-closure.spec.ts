import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  activeSubscription,
  createStudioApiFixture,
  installStudioApiMock,
  secondActiveMembership,
} from './studio-api-mock'

/*
 * HU-STUDIO-013, the heaviest action in the product. Four of its six criteria
 * are promises the dialog makes, and three of those would have been wrong if
 * written from the story instead of from the function:
 *
 *  · a subscription that is not `ended` blocks the closure — suspended too;
 *  · the clients are never told, because `relationship.terminated.v1` has no
 *    worker, which the delivery-coverage test names as open;
 *  · and the retention period criterion 3 asks for does not exist yet, so no
 *    deadline is promised.
 */

const ORGANIZATION_PATH = `/organizations/${activeMembership.organization_id}/organization`

/** Nothing in the way: the default fixture ships one live subscription. */
function closeable() {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.organizationSubscriptions = []
  return fixture
}

function openOrganization(page: Page) {
  return page.goto(ORGANIZATION_PATH)
}

function closeButton(page: Page) {
  return page.getByRole('button', { name: 'Cerrar la organización', exact: true })
}

test('an owner is offered the closure, at the end of the screen', async ({ page }) => {
  await installStudioApiMock(page, closeable())
  await openOrganization(page)

  await expect(page.getByRole('heading', { name: 'Cerrar la organización' })).toBeVisible()
  await expect(closeButton(page)).toBeEnabled()
})

/*
 * `('owner', 'close_organization')` is one row in the catalogue. An admin can
 * change everything else about the organization and not this.
 */
test('an admin is offered nothing, however much else they may change', async ({ page }) => {
  /*
   * The role goes in `memberships`, which is what the organization context
   * reads — `me.memberships` feeds the account screen instead, and setting
   * that one left the context an owner and the test asserting nothing.
   */
  const fixture = createStudioApiFixture({
    memberships: [{ ...activeMembership, roles: ['admin'] }],
  })
  fixture.organizationSubscriptions = []
  await installStudioApiMock(page, fixture)
  await page.goto(ORGANIZATION_PATH)

  await expect(page.getByRole('heading', { name: 'Datos' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cerrar la organización' })).toHaveCount(0)
})

/*
 * The precondition the screen checks so a `422` never arrives with nothing to
 * act on. The button stays visible with the reason beside it: a control that
 * disappears leaves an owner hunting for why they cannot close.
 */
test('a live subscription blocks it, with the reason and where to go', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openOrganization(page)

  await expect(page.getByText('No puedes cerrarla todavía')).toBeVisible()
  await expect(page.getByText(/1 suscripción activa/)).toBeVisible()
  await expect(page.getByText(/Termínalas primero en Cobros/)).toBeVisible()
  await expect(closeButton(page)).toBeDisabled()
})

// `status <> 'ended'` is the function's test, so suspended blocks as much.
test('a suspended subscription blocks it too, and says why it counts', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.organizationSubscriptions = [{ ...activeSubscription, status: 'suspended' }]
  await installStudioApiMock(page, fixture)
  await openOrganization(page)

  await expect(page.getByText(/1 suspendida/)).toBeVisible()
  await expect(page.getByText(/Una suspendida cuenta igual/)).toBeVisible()
  await expect(closeButton(page)).toBeDisabled()
})

test('the dialog says what closing does, and that it includes your own membership', async ({
  page,
}) => {
  await installStudioApiMock(page, closeable())
  await openOrganization(page)
  await closeButton(page).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('queda congelado')
  await expect(dialog).toContainText('los programas se desacoplan')
  await expect(dialog).toContainText('incluida la tuya')
  await expect(dialog).toContainText('No se puede deshacer')
})

// Criterion 2, the half that reassures, and the one an owner needs most.
test('and that nothing of anybody is deleted', async ({ page }) => {
  await installStudioApiMock(page, closeable())
  await openOrganization(page)
  await closeButton(page).click()

  await expect(page.getByRole('alertdialog')).toContainText('No se borra el Fitness ID de nadie')
  await expect(page.getByRole('alertdialog')).toContainText('ni las sesiones')
})

/*
 * Criterion 3 asks for a purpose **and a term**, and the migration says the
 * retention period is a legal decision not yet taken. The dialog gives the
 * purpose and invents no deadline.
 */
test('the kept evidence has a purpose and no invented deadline', async ({ page }) => {
  await installStudioApiMock(page, closeable())
  await openOrganization(page)
  await closeButton(page).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('evidencia mínima')
  await expect(dialog).toContainText('Conservar no es seguir teniendo acceso')
  for (const invented of ['días', 'meses', 'años']) {
    await expect(dialog).not.toContainText(invented)
  }
})

// Criteria 4 and 6: nothing closes if any contract refuses.
test('and that there is no half-closure', async ({ page }) => {
  await installStudioApiMock(page, closeable())
  await openOrganization(page)
  await closeButton(page).click()

  await expect(page.getByRole('alertdialog')).toContainText('no se cierra nada')
})

/*
 * The one sentence that is a warning rather than a promise. The closure
 * enqueues the relationship notice and no worker delivers it, so telling the
 * owner to do it themselves is the only honest thing available.
 */
test('the dialog tells the owner to warn the clients, because nobody else will', async ({
  page,
}) => {
  await installStudioApiMock(page, closeable())
  await openOrganization(page)
  await closeButton(page).click()

  await expect(page.getByRole('alertdialog')).toContainText('Avísales tú')
  await expect(page.getByRole('alertdialog')).toContainText('no les avisa nadie')
})

/*
 * The receipt, and the number the sibling closure dialogs could not give: the
 * response carries `relationships_terminated`. Leaving is then explicit,
 * because the owner's own membership is closed.
 */
test('closing reports what it did and then lets the owner leave', async ({ page }) => {
  const fixture = closeable()
  fixture.closedRelationships = 3
  await installStudioApiMock(page, fixture)
  await openOrganization(page)
  await closeButton(page).click()
  await page.getByRole('button', { name: 'Cerrar ahora' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('quedó cerrada')
  await expect(dialog).toContainText('Se terminaron 3 relaciones')
  // Said again, because it is the one thing still pending on them.
  await expect(dialog).toContainText('Queda avisarles')

  const command = fixture.requests.find(
    (request) => request.method === 'POST' && request.path.endsWith('/closure'),
  )
  expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(command?.body).toBeUndefined()

  await page.getByRole('button', { name: 'Salir de la organización' }).click()
  await expect(page).toHaveURL(/\/app$/)
})

test('a gym with no relationships says so rather than reporting a zero', async ({ page }) => {
  const fixture = closeable()
  fixture.closedRelationships = 0
  await installStudioApiMock(page, fixture)
  await openOrganization(page)
  await closeButton(page).click()
  await page.getByRole('button', { name: 'Cerrar ahora' }).click()

  await expect(page.getByRole('alertdialog')).toContainText(
    'No había ninguna relación activa que terminar',
  )
})

/*
 * The refusal the screen tries to prevent: a subscription revived while the
 * dialog was open. It has to say the organization is still open, because after
 * asking to close a gym an unexplained failure is the worst possible doubt.
 */
test('a refusal keeps the dialog open and says the organization is still open', async ({
  page,
}) => {
  const fixture = closeable()
  fixture.organizationClosureOutcome = 'rejected'
  await installStudioApiMock(page, fixture)
  await openOrganization(page)
  await closeButton(page).click()
  await page.getByRole('button', { name: 'Cerrar ahora' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('No se pudo cerrar todavía')
  await expect(dialog).toContainText('sigue abierta')
  await expect(page).toHaveURL(/\/organization$/)
})

test('somebody who stopped being the owner is told that, not given a failure', async ({ page }) => {
  const fixture = closeable()
  fixture.organizationClosureOutcome = 'not-allowed'
  await installStudioApiMock(page, fixture)
  await openOrganization(page)
  await closeButton(page).click()
  await page.getByRole('button', { name: 'Cerrar ahora' }).click()

  await expect(page.getByRole('alertdialog')).toContainText('Ya no puedes cerrar esta organización')
  await expect(page.getByRole('alertdialog')).toContainText('transferir la propiedad')
})

test('an organization already closed is not offered the closure again', async ({ page }) => {
  const fixture = closeable()
  if (typeof fixture.organization === 'object' && fixture.organization !== null) {
    fixture.organization = { ...fixture.organization, status: 'closed' }
  }
  await installStudioApiMock(page, fixture)
  await openOrganization(page)

  await expect(page.getByText('Cerrada')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cerrar la organización' })).toHaveCount(0)
})

test('a coach never reads the subscriptions this screen needs to decide', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [secondActiveMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(`/organizations/${secondActiveMembership.organization_id}/organization`)

  await expect(page.getByRole('heading', { name: 'Datos' })).toBeVisible()
  // Only the owner can close, so only the owner pays for that read.
  expect(fixture.requests.some((request) => request.path.includes('/subscriptions'))).toBe(false)
})
