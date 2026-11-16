import { expect, test } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  draftedProgram,
  installStudioApiMock,
  problem,
  programVersionOne,
  secondActiveMembership,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-043: retiring a program version, which is the owner's and the
 * admin's. Criterion 1 is audited where a program is assigned: the invitation
 * a coach writes stops offering it. Criterion 2, nothing cancelled, is the
 * server's — assignments name the version by id — and is said before the click.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const VERSION_PATH = `${CONTENT_PATH}/programs/${draftedProgram.id}/versions/1`

/** The drafted program, published once; and a coach elsewhere who may assign it. */
function withPublishedProgram(): StudioApiFixture {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership, secondActiveMembership],
  })
  fixture.organizationPrograms = [
    {
      ...structuredClone(draftedProgram),
      status: 'published',
      versions: [structuredClone(programVersionOne)],
    },
  ]
  return fixture
}

function retirements(fixture: StudioApiFixture) {
  return fixture.requests.filter((request) => request.path.endsWith('/deprecation'))
}

test('an owner retires a program version, which then cannot be assigned', async ({ page }) => {
  const fixture = withPublishedProgram()
  await installStudioApiMock(page, fixture)

  // Before: the coach's invitation offers it.
  const invitationPath = `/organizations/${secondActiveMembership.organization_id}/clients/invitations/new`
  await page.goto(invitationPath)
  await page.getByRole('combobox', { name: 'Programa' }).click()
  await expect(page.getByRole('option', { name: /Hipertrofia de cuatro semanas/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto(VERSION_PATH)
  await page.getByRole('button', { name: 'Retirar esta versión' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('No se puede deshacer.')
  await expect(dialog).toContainText('Quien ya la tiene asignada la conserva')
  await dialog.getByRole('button', { name: 'Retirar ahora' }).click()

  await expect(page.locator('[data-version-retired]')).toContainText(
    'Ya no se puede asignar a nadie más',
  )
  await expect(page.getByRole('button', { name: 'Retirar esta versión' })).toHaveCount(0)
  expect(retirements(fixture)).toHaveLength(1)
  expect(retirements(fixture)[0]?.body).toBeUndefined()

  // After: criterion 1. It was the only published version, so nothing is left to propose.
  await page.goto(invitationPath)
  await expect(
    page.getByText('Todavía no hay ninguna versión de programa publicada.', { exact: false }),
  ).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Programa' })).toHaveCount(0)
})

test('keeping the version sends nothing', async ({ page }) => {
  const fixture = withPublishedProgram()
  await installStudioApiMock(page, fixture)
  await page.goto(VERSION_PATH)

  await page.getByRole('button', { name: 'Retirar esta versión' }).click()
  await page.getByRole('button', { name: 'Mantenerla' }).click()

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(retirements(fixture)).toHaveLength(0)
})

test('a coach is told who retires, and is offered nothing', async ({ page }) => {
  const fixture = withPublishedProgram()
  fixture.memberships = [{ ...activeMembership, roles: ['coach'] }]
  await installStudioApiMock(page, fixture)
  await page.goto(VERSION_PATH)

  await expect(
    page.getByText('Retirar una versión corresponde a propietario y administración.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retirar esta versión' })).toHaveCount(0)
})

test('a refusal is explained inside the dialog, and the version stays published', async ({
  page,
}) => {
  const fixture = withPublishedProgram()
  fixture.intercept = (request) =>
    request.path.endsWith('/deprecation')
      ? { status: 403, body: problem('forbidden', 403) }
      : undefined
  await installStudioApiMock(page, fixture)
  await page.goto(VERSION_PATH)

  await page.getByRole('button', { name: 'Retirar esta versión' }).click()
  await page.getByRole('button', { name: 'Retirar ahora' }).click()

  await expect(page.getByRole('alertdialog')).toContainText(
    'Retirar versiones corresponde a propietario y administración',
  )
  await page.getByRole('button', { name: 'Mantenerla' }).click()
  await expect(page.locator('[data-version-retired]')).toHaveCount(0)
})
