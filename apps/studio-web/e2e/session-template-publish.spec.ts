import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  publishedTemplate,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-038: publishing a template version. Criteria 1 and 2 are the
 * server's (a version has no write route, and a program names a version id),
 * so the screen says them before the click: publishing asks first, and the
 * question is where they are read. This audits the other two: an incomplete
 * draft answers with what is missing, and publishing the same content again
 * does not make a second version.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const EDITOR_PATH = `${CONTENT_PATH}/templates/${publishedTemplate.id}`

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
  return page.locator('[data-template-publish]')
}

/** The state of the template, beside its name. */
function status(page: Page) {
  return page.locator('[data-editor-bar] [data-library-status]')
}

async function publish(page: Page) {
  await publishButton(page).click()
  await confirmation(page).getByRole('button', { name: 'Publicar versión' }).click()
}

test('a saved draft is published as the next version, conditioned on what was saved', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await expect(status(page)).toHaveText('Publicada v2')
  await publishButton(page).click()
  await expect(confirmation(page)).toContainText('La versión más reciente es la 2.')
  await expect(confirmation(page)).toContainText('Una versión publicada no se edita nunca')
  // Nothing is sent until the question is answered.
  expect(publications(fixture)).toHaveLength(0)
  await confirmation(page).getByRole('button', { name: 'Publicar versión' }).click()

  await expect(
    page.getByText('Publicada la versión 3. Ya se puede usar en programas.'),
  ).toBeVisible()
  // The state beside the name is the list's, and it moves with the publication.
  await expect(status(page)).toHaveText('Publicada v3')
  const [sent] = publications(fixture)
  expect(sent?.headers['if-match']).toBe(publishedTemplate.draft.etag)
  expect(sent?.body).toBeUndefined()

  await publishButton(page).click()
  await expect(confirmation(page)).toContainText('La versión más reciente es la 3.')
})

test('the question can be answered no, and nothing is published', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await publishButton(page).click()
  await confirmation(page).getByRole('button', { name: 'Cancelar' }).click()

  await expect(confirmation(page)).toHaveCount(0)
  await expect(status(page)).toHaveText('Publicada v2')
  expect(publications(fixture)).toHaveLength(0)
})

test('publishing the same content again does not make another version', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await publish(page)
  await expect(page.getByText(/Publicada la versión 3\./)).toBeVisible()
  await expect(status(page)).toHaveText('Publicada v3')

  await publish(page)
  await expect(
    page.getByText('El borrador es igual a la versión 3, así que no se creó una versión nueva.'),
  ).toBeVisible()
  await expect(status(page)).toHaveText('Publicada v3')
  expect(publications(fixture)).toHaveLength(2)
})

test('unsaved work is saved before it can be published', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await page.getByLabel('Nombre').fill('Fuerza tren superior · bloque 2')

  await expect(publishButton(page)).toBeDisabled()
  // Why it is off is said on the button, to whoever points at it.
  await page.locator('[data-template-publish-action]').hover()
  await expect(page.locator('[data-template-publish-blocked]')).toContainText(
    'Guarda el borrador antes de publicar',
  )

  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()
  await expect(publishButton(page)).toBeEnabled()
  expect(publications(fixture)).toHaveLength(0)
})

test('an incomplete draft answers with the list of what is missing', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}/templates/new`)
  // Scoped to the dialog: the list behind it has a discipline filter of its own.
  const form = page.getByRole('dialog', { name: 'Nueva plantilla' })
  await form.getByLabel('Disciplina').click()
  await page.getByRole('option', { name: 'Fuerza' }).click()
  await form.getByLabel('Nombre').fill('Vacía')
  await page.getByRole('button', { name: 'Crear plantilla' }).click()

  await expect(status(page)).toHaveText('Borrador')
  await publishButton(page).click()
  await expect(confirmation(page)).toContainText('Todavía no se ha publicado ninguna versión.')
  await confirmation(page).getByRole('button', { name: 'Publicar versión' }).click()

  const missing = page.locator('[data-template-publish-issues]')
  await expect(missing).toContainText('Al borrador le falta esto para publicarse')
  await expect(missing).toContainText(
    'El tipo de actividad ya no está publicado o no es de la disciplina.',
  )
  await expect(missing).toContainText('La plantilla necesita al menos un paso.')
  await expect(status(page)).toHaveText('Borrador')
})

test('a draft somebody else saved meanwhile is shown, not published blindly', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)
  await expect(page.getByLabel('Nombre')).toHaveValue('Fuerza tren superior')

  // Another session saves first; this screen still holds the older ETag.
  const template = fixture.organizationSessionTemplates[0] as typeof publishedTemplate
  fixture.organizationSessionTemplates[0] = {
    ...template,
    draft: { ...template.draft, etag: `"sha256:${'e'.repeat(43)}"` },
  }

  await publish(page)

  await expect(page.getByText('Alguien guardó este borrador mientras lo editabas')).toBeVisible()
  await expect(publishButton(page)).toBeDisabled()
  await page.locator('[data-template-publish-action]').hover()
  await expect(page.locator('[data-template-publish-blocked]')).toContainText(
    'Resuelve primero el aviso',
  )
})
