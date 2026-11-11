import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  draftedProgram,
  installStudioApiMock,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-042: publishing a program version. Criteria 2 and 3 are the
 * server's — a version has no write route, and a session stores a template
 * version id — so the screen says them before the click. Criterion 4 is
 * audited by its answer: the same content twice gives the same version back.
 * HU-041's third criterion lands here too: publishing warns about the retired
 * versions the saved draft keeps.
 */

const EDITOR_PATH = `/organizations/${activeMembership.organization_id}/content/programs/${draftedProgram.id}`

function publications(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/versions'),
  )
}

function publishCard(page: Page) {
  return page.locator('[data-program-publish]')
}

test('a version is said to be final, and to keep its template versions, before the click', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  await expect(publishCard(page)).toContainText('Todavía no se ha publicado ninguna versión.')
  await expect(publishCard(page)).toContainText('Una versión publicada no se edita nunca.')
  await expect(publishCard(page)).toContainText(
    'si esa plantilla publica otra, este programa sigue en la suya',
  )
})

test('the retired versions the draft keeps are warned about before publishing', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  const warning = page.locator('[data-program-publish-retired]')
  await expect(warning).toContainText('Vas a publicar versiones retiradas')
  await expect(warning).toContainText('Fuerza tren superior · versión 1')
  // A warning, not a block: the server publishes them as they are.
  await expect(publishCard(page).getByRole('button', { name: 'Publicar versión' })).toBeEnabled()
})

test('publishing makes the first version, conditioned on the saved draft', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await publishCard(page).getByRole('button', { name: 'Publicar versión' }).click()

  await expect(page.locator('[data-program-publish-status]')).toHaveText(
    'Publicada la versión 1. Ya se puede asignar a una persona.',
  )
  const [sent] = publications(fixture)
  expect(sent?.headers['if-match']).toBe(draftedProgram.draft.etag)
  expect(sent?.body).toBeUndefined()
  await expect(publishCard(page)).toContainText('La versión más reciente es la 1.')
})

test('the same content published twice converges to one version', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)
  const button = publishCard(page).getByRole('button', { name: 'Publicar versión' })

  await button.click()
  await expect(page.locator('[data-program-publish-status]')).toContainText('versión 1')
  await expect(publishCard(page)).toContainText('La versión más reciente es la 1.')
  await button.click()

  await expect(page.locator('[data-program-publish-status]')).toHaveText(
    'El borrador es igual a la versión 1, así que no se creó una versión nueva.',
  )
  expect(publications(fixture)).toHaveLength(2)
})

test('an empty program is told what it lacks', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.organizationPrograms = [
    {
      ...structuredClone(draftedProgram),
      draft: {
        ...structuredClone(draftedProgram.draft),
        content: { ...structuredClone(draftedProgram.draft.content), sessions: [] },
        deprecated_template_version_ids: [],
      },
    },
  ]
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await publishCard(page).getByRole('button', { name: 'Publicar versión' }).click()

  await expect(page.locator('[data-program-publish-issues]')).toContainText(
    'El programa necesita al menos una sesión para publicarse.',
  )
})

test('unsaved work waits to be saved, because what is published is what is saved', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await page.getByLabel('Nombre').fill('Hipertrofia · bloque 2')

  await expect(publishCard(page)).toContainText('Guarda el borrador antes de publicar')
  await expect(publishCard(page).getByRole('button', { name: 'Publicar versión' })).toBeDisabled()
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(publishCard(page).getByRole('button', { name: 'Publicar versión' })).toBeEnabled()
})

test('once the retired session is gone and saved, publishing warns about nothing', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await page.getByRole('button', { name: 'Quitar la sesión del día 1 de la semana 2' }).click()
  // Until it is saved, the warning still describes what would be published.
  await expect(page.locator('[data-program-publish-retired]')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar borrador' }).click()

  await expect(page.locator('[data-program-publish-retired]')).toHaveCount(0)
  await publishCard(page).getByRole('button', { name: 'Publicar versión' }).click()
  await expect(page.locator('[data-program-publish-status]')).toContainText(
    'Publicada la versión 1',
  )
})
