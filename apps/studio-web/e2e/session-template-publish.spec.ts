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
 * so the screen says them before the click. This audits the other two: an
 * incomplete draft answers with what is missing, and publishing the same
 * content again does not make a second version.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const EDITOR_PATH = `${CONTENT_PATH}/templates/${publishedTemplate.id}`

function publications(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/versions'),
  )
}

function publishCard(page: Page) {
  return page.locator('[data-template-publish]')
}

test('a saved draft is published as the next version, conditioned on what was saved', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await expect(publishCard(page)).toContainText('La versión más reciente es la 2.')
  await expect(publishCard(page)).toContainText('Una versión publicada no se edita nunca')
  await publishCard(page).getByRole('button', { name: 'Publicar versión' }).click()

  await expect(publishCard(page)).toContainText(
    'Publicada la versión 3. Ya se puede usar en programas.',
  )
  await expect(publishCard(page)).toContainText('La versión más reciente es la 3.')
  const [sent] = publications(fixture)
  expect(sent?.headers['if-match']).toBe(publishedTemplate.draft.etag)
  expect(sent?.body).toBeUndefined()
})

test('publishing the same content again does not make another version', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await publishCard(page).getByRole('button', { name: 'Publicar versión' }).click()
  await expect(publishCard(page)).toContainText('Publicada la versión 3.')
  await expect(publishCard(page)).toContainText('La versión más reciente es la 3.')

  await publishCard(page).getByRole('button', { name: 'Publicar versión' }).click()
  await expect(publishCard(page)).toContainText(
    'El borrador es igual a la versión 3, así que no se creó una versión nueva.',
  )
  expect(publications(fixture)).toHaveLength(2)
})

test('unsaved work is saved before it can be published', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await page.getByLabel('Nombre').fill('Fuerza tren superior · bloque 2')

  await expect(publishCard(page).getByRole('button', { name: 'Publicar versión' })).toBeDisabled()
  await expect(publishCard(page)).toContainText('Guarda el borrador antes de publicar')

  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()
  await expect(publishCard(page).getByRole('button', { name: 'Publicar versión' })).toBeEnabled()
  expect(publications(fixture)).toHaveLength(0)
})

test('an incomplete draft answers with the list of what is missing', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}/templates/new`)
  await page.getByLabel('Disciplina').click()
  await page.getByRole('option', { name: 'Fuerza' }).click()
  await page.getByLabel('Nombre').fill('Vacía')
  await page.getByRole('button', { name: 'Crear plantilla' }).click()

  await expect(publishCard(page)).toContainText('Todavía no se ha publicado ninguna versión.')
  await publishCard(page).getByRole('button', { name: 'Publicar versión' }).click()

  const missing = page.locator('[data-template-publish-issues]')
  await expect(missing).toContainText('Al borrador le falta esto para publicarse')
  await expect(missing).toContainText(
    'El tipo de actividad ya no está publicado o no es de la disciplina.',
  )
  await expect(missing).toContainText('La plantilla necesita al menos un paso.')
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

  await publishCard(page).getByRole('button', { name: 'Publicar versión' }).click()

  await expect(page.getByText('Alguien guardó este borrador mientras lo editabas')).toBeVisible()
  await expect(publishCard(page)).toContainText('Resuelve primero el aviso')
})
