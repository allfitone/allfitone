import { expect, test } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  problem,
  STRENGTH_OWN_MOVEMENT_ID,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-066: archiving a movement of our own, which is the owner's and the
 * admin's. Criterion 1 is audited by the search: archived, it leaves the list
 * unless asked for. Criteria 2 and 3 — history keeps resolving it, and it is
 * never deleted — are the server's, said before the click and visible after:
 * the movement still reads by its name.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const OWN_PATH = `${CONTENT_PATH}/movements/${STRENGTH_OWN_MOVEMENT_ID}`

function archivals(fixture: StudioApiFixture) {
  return fixture.requests.filter((request) => request.path.endsWith('/archival'))
}

test('an owner archives our movement, which then leaves the search for new content', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(OWN_PATH)

  await page.getByRole('button', { name: 'Archivar', exact: true }).click()
  await page.getByRole('button', { name: 'Archivar ahora' }).click()

  await expect(page.getByText(/Está archivado: ya no se edita/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
  // Criteria 2 and 3: not deleted, and still read by its name.
  await expect(page.locator('[data-movement-summary]')).toContainText(
    'Remo con mancuerna a una mano',
  )
  await expect(page.locator('[data-movement-summary]')).toContainText('Archivado')
  expect(archivals(fixture)).toHaveLength(1)
  expect(archivals(fixture)[0]?.body).toBeUndefined()

  await page.getByRole('link', { name: 'Volver al contenido' }).click()
  await page.getByRole('tab', { name: 'Movimientos' }).click()
  const list = page.getByRole('list', { name: 'Movimientos' })
  await expect(list).toContainText('Press de banca')
  await expect(list).not.toContainText('Remo con mancuerna a una mano')
  await page.getByRole('checkbox', { name: 'Incluir los archivados' }).click()
  await expect(list).toContainText('Remo con mancuerna a una mano')
})

test('the dialog says it cannot be undone, and keeping it sends nothing', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(OWN_PATH)

  await page.getByRole('button', { name: 'Archivar', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('No se puede deshacer.')
  await expect(dialog).toContainText('el movimiento no se borra')
  await dialog.getByRole('button', { name: 'Mantenerlo' }).click()

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(archivals(fixture)).toHaveLength(0)
})

test('a coach is told who archives, and is offered nothing', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [{ ...activeMembership, roles: ['coach'] }] }),
  )
  await page.goto(OWN_PATH)

  // Editing is still the coach's: `manage_content` covers it.
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()
  await expect(
    page.getByText('Archivar un movimiento corresponde a propietario y administración.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archivar', exact: true })).toHaveCount(0)
})

test('a refusal is explained inside the dialog, and the movement stays', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.intercept = (request) =>
    request.path.endsWith('/archival')
      ? { status: 403, body: problem('forbidden', 403) }
      : undefined
  await installStudioApiMock(page, fixture)
  await page.goto(OWN_PATH)

  await page.getByRole('button', { name: 'Archivar', exact: true }).click()
  await page.getByRole('button', { name: 'Archivar ahora' }).click()

  await expect(page.getByRole('alertdialog')).toContainText(
    'Archivar movimientos corresponde a propietario y administración, y tu rol ya no lo permite.',
  )
  await page.getByRole('button', { name: 'Mantenerlo' }).click()
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()
})
