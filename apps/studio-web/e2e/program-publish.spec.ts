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
 * version id — so the question asked before publishing says them. Criterion 4 is
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

function publishButton(page: Page) {
  return page.getByRole('button', { name: 'Publicar', exact: true })
}

/** The question publishing asks before it is done. */
function confirmation(page: Page) {
  return page.locator('[data-program-publish]')
}

/** The state of the program, beside its name. */
function status(page: Page) {
  return page.locator('[data-editor-bar] [data-library-status]')
}

async function publish(page: Page) {
  await publishButton(page).click()
  await confirmation(page).getByRole('button', { name: 'Publicar versión' }).click()
}

test('a version is said to be final, and to keep its template versions, before it is made', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await publishButton(page).click()

  await expect(confirmation(page)).toContainText('Todavía no se ha publicado ninguna versión.')
  await expect(confirmation(page)).toContainText('Una versión publicada no se edita nunca.')
  await expect(confirmation(page)).toContainText(
    'si esa plantilla publica otra, este programa sigue en la suya',
  )
  // Nothing is sent until the question is answered.
  expect(publications(fixture)).toHaveLength(0)
})

test('the question can be answered no, and nothing is published', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await publishButton(page).click()
  await confirmation(page).getByRole('button', { name: 'Cancelar' }).click()

  await expect(confirmation(page)).toHaveCount(0)
  await expect(status(page)).toHaveText('Borrador')
  expect(publications(fixture)).toHaveLength(0)
})

test('the retired versions the draft keeps are warned about before publishing', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  await publishButton(page).click()

  const warning = page.locator('[data-program-publish-retired]')
  await expect(warning).toContainText('Vas a publicar versiones retiradas')
  await expect(warning).toContainText('Fuerza tren superior · versión 1')
  // A warning, not a block: the server publishes them as they are.
  await expect(confirmation(page).getByRole('button', { name: 'Publicar versión' })).toBeEnabled()
})

test('publishing makes the first version, conditioned on the saved draft', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await expect(status(page)).toHaveText('Borrador')
  await publish(page)

  await expect(
    page.getByText('Publicada la versión 1. Ya se puede asignar a una persona.'),
  ).toBeVisible()
  // The state beside the name is the list's, and it moves with the publication.
  await expect(status(page)).toHaveText('Publicado v1')
  const [sent] = publications(fixture)
  expect(sent?.headers['if-match']).toBe(draftedProgram.draft.etag)
  expect(sent?.body).toBeUndefined()
  await publishButton(page).click()
  await expect(confirmation(page)).toContainText('La versión más reciente es la 1.')
})

test('the same content published twice converges to one version', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await publish(page)
  await expect(page.getByText(/Publicada la versión 1\./)).toBeVisible()
  await expect(status(page)).toHaveText('Publicado v1')
  await publish(page)

  await expect(
    page.getByText('El borrador es igual a la versión 1, así que no se creó una versión nueva.'),
  ).toBeVisible()
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

  await publish(page)

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

  await expect(publishButton(page)).toBeDisabled()
  // Why it is off is said on the button, to whoever points at it.
  await page.locator('[data-program-publish-action]').hover()
  await expect(page.locator('[data-program-publish-blocked]')).toContainText(
    'Guarda el borrador antes de publicar',
  )
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()
  await expect(publishButton(page)).toBeEnabled()
  expect(publications(fixture)).toHaveLength(0)
})

test('once the retired session is gone and saved, publishing warns about nothing', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await page.locator('[data-program-session]', { hasText: 'Retirada' }).getByRole('button').click()
  await page.getByRole('button', { name: 'Quitar la sesión del día 1 de la semana 2' }).click()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()

  await publishButton(page).click()
  await expect(confirmation(page)).toContainText('Una versión publicada no se edita nunca.')
  await expect(page.locator('[data-program-publish-retired]')).toHaveCount(0)
  await confirmation(page).getByRole('button', { name: 'Publicar versión' }).click()
  await expect(page.getByText(/Publicada la versión 1\./)).toBeVisible()
})
