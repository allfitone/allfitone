import { expect, test } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  problem,
  publishedTemplate,
  STRENGTH_TEMPLATE_V2_ID,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-039: starting a draft from a published version. Criterion 1 is the
 * draft keeping where it came from, which the editor and the library both
 * say; criterion 2, no other organization's content, is the server's 404 and
 * is audited on the version read (HU-045).
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const VERSION_PATH = `${CONTENT_PATH}/templates/${publishedTemplate.id}/versions/2`

function derivations(fixture: StudioApiFixture) {
  return fixture.requests.filter((request) => request.path.endsWith('/derivation'))
}

/** A draft somebody had started changing, so replacing it is visible. */
function withChangedDraft(): StudioApiFixture {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.organizationSessionTemplates = fixture.organizationSessionTemplates.map((entry) => {
    const template = entry as typeof publishedTemplate
    return template.id === publishedTemplate.id
      ? {
          ...template,
          draft: {
            ...template.draft,
            content: { ...template.draft.content, title: 'Borrador a medias' },
          },
        }
      : entry
  })
  return fixture
}

test('a draft starts from a published version, and then says it came from it', async ({ page }) => {
  const fixture = withChangedDraft()
  await installStudioApiMock(page, fixture)
  await page.goto(VERSION_PATH)

  await page.getByRole('button', { name: 'Partir de esta versión' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Lo que el borrador tenga ahora sin publicar se pierde.')
  await dialog.getByRole('button', { name: 'Reemplazar el borrador' }).click()

  await expect(page).toHaveURL(`${CONTENT_PATH}/templates/${publishedTemplate.id}`)
  await expect(page.getByLabel('Nombre')).toHaveValue('Fuerza tren superior')
  await expect(page.getByText(/Parte de la versión 2\./)).toBeVisible()
  const [sent] = derivations(fixture)
  expect(sent?.headers['if-match']).toBe(publishedTemplate.draft.etag)
  expect(sent?.body).toBeUndefined()

  // The library marks it as an adaptation, from the same recorded source.
  await page.goto(CONTENT_PATH)
  await expect(
    page.locator('[data-content-register-item]', { hasText: 'Fuerza tren superior' }),
  ).toContainText('Adaptación')
  const template = fixture.organizationSessionTemplates.find(
    (entry) => (entry as typeof publishedTemplate).id === publishedTemplate.id,
  ) as typeof publishedTemplate
  expect(template.draft.derived_from_version_id).toBe(STRENGTH_TEMPLATE_V2_ID)
})

test('keeping the draft sends nothing', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(VERSION_PATH)

  await page.getByRole('button', { name: 'Partir de esta versión' }).click()
  await page.getByRole('button', { name: 'Conservar el borrador' }).click()

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(derivations(fixture)).toHaveLength(0)
})

test('a retired version is not offered as a starting point', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}/templates/${publishedTemplate.id}/versions/1`)

  await expect(page.getByText(/ni servir de punto de partida/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Partir de esta versión' })).toHaveCount(0)
})

test('a version retired meanwhile is explained, and the draft stays', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.intercept = (request) =>
    request.path.endsWith('/derivation')
      ? { status: 404, body: problem('not-found', 404) }
      : undefined
  await installStudioApiMock(page, fixture)
  await page.goto(VERSION_PATH)

  await page.getByRole('button', { name: 'Partir de esta versión' }).click()
  await page.getByRole('button', { name: 'Reemplazar el borrador' }).click()

  await expect(page.getByRole('alertdialog')).toContainText(
    'Esa versión ya no se puede usar como punto de partida',
  )
  await expect(page).toHaveURL(VERSION_PATH)
})
