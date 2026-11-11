import { expect, test } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  draftedProgram,
  installStudioApiMock,
  problem,
  publishedTemplate,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-040: retiring a template version, which is the owner's and the
 * admin's. Criterion 1 is audited where new content is composed: the program
 * editor stops offering it. Criterion 2 is audited where history already
 * uses it: the program that named it keeps it, marked, untouched.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const VERSION_PATH = `${CONTENT_PATH}/templates/${publishedTemplate.id}/versions/2`

function retirements(fixture: StudioApiFixture) {
  return fixture.requests.filter((request) => request.path.endsWith('/deprecation'))
}

test('an owner retires a version, which new programs then cannot take', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(VERSION_PATH)

  await page.getByRole('button', { name: 'Retirar esta versión' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('No se puede deshacer.')
  await expect(dialog).toContainText('Los programas que ya la usan la conservan')
  await dialog.getByRole('button', { name: 'Retirar ahora' }).click()

  await expect(page.locator('[data-version-retired]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retirar esta versión' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Partir de esta versión' })).toHaveCount(0)
  expect(retirements(fixture)).toHaveLength(1)
  expect(retirements(fixture)[0]?.body).toBeUndefined()

  /*
   * Criterion 1: its only other version was already retired, so the template
   * has nothing left a new session can take — and it was the one template
   * that had published anything.
   */
  await page.goto(`${CONTENT_PATH}/programs/${draftedProgram.id}`)
  await expect(page.locator('[data-program-add-session]')).toContainText(
    'Todavía no hay versiones de plantilla que usar',
  )
  // Criterion 2: the program that already named it keeps every session.
  await expect(page.locator('[data-program-session]')).toHaveCount(3)
  await expect(page.locator('[data-program-retired]')).toContainText('3 sesiones')
})

test('keeping the version sends nothing', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(VERSION_PATH)

  await page.getByRole('button', { name: 'Retirar esta versión' }).click()
  await page.getByRole('button', { name: 'Mantenerla' }).click()

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(retirements(fixture)).toHaveLength(0)
})

test('a coach is told who retires, and is offered nothing', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [{ ...activeMembership, roles: ['coach'] }] }),
  )
  await page.goto(VERSION_PATH)

  await expect(
    page.getByText('Retirar una versión corresponde a propietario y administración.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retirar esta versión' })).toHaveCount(0)
  // Starting from it is still the coach's.
  await expect(page.getByRole('button', { name: 'Partir de esta versión' })).toBeVisible()
})

test('a refusal is explained inside the dialog, and the version stays published', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.intercept = (request) =>
    request.path.endsWith('/deprecation')
      ? { status: 403, body: problem('forbidden', 403) }
      : undefined
  await installStudioApiMock(page, fixture)
  await page.goto(VERSION_PATH)

  await page.getByRole('button', { name: 'Retirar esta versión' }).click()
  await page.getByRole('button', { name: 'Retirar ahora' }).click()

  await expect(page.getByRole('alertdialog')).toContainText(
    'Retirar versiones corresponde a propietario y administración, y tu rol ya no lo permite.',
  )
  await page.getByRole('button', { name: 'Mantenerla' }).click()
  await expect(page.locator('[data-version-retired]')).toHaveCount(0)
})

test('a version already retired offers no retirement', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}/templates/${publishedTemplate.id}/versions/1`)

  await expect(page.locator('[data-version-retired]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retirar esta versión' })).toHaveCount(0)
})
