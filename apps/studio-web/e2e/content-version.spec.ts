import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  draftedProgram,
  installStudioApiMock,
  problem,
  programVersionOne,
  publishedTemplate,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-045: reading a published version whole. Both criteria are the
 * server's — `OP-PLN-021` answers 404 outside the organization, and a version
 * has no write route — so this audits that the page reads everything a version
 * holds, says it does not change, and treats a 404 as not found and nothing more.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`

function withPublishedProgram(): StudioApiFixture {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.organizationPrograms = [
    {
      ...structuredClone(draftedProgram),
      status: 'published',
      versions: [structuredClone(programVersionOne)],
    },
  ]
  return fixture
}

function card(page: Page, title: string) {
  return page.locator('[data-content-register-item]', { hasText: title })
}

test('a template version opens from the library and reads whole, said to be final', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(CONTENT_PATH)

  await card(page, 'Fuerza tren superior')
    .getByRole('button', { name: /Ver versiones/ })
    .click()
  await page.getByRole('link', { name: 'Leer la versión 1 de Fuerza tren superior' }).click()

  await expect(page).toHaveURL(`${CONTENT_PATH}/templates/${publishedTemplate.id}/versions/1`)
  await expect(page.getByRole('heading', { level: 1, name: 'Versión de plantilla' })).toBeVisible()
  await expect(page.getByText(/Una versión publicada no cambia/)).toBeVisible()
  await expect(page.locator('[data-version-retired]')).toContainText(
    'Ya no se puede sumar a programas nuevos',
  )
  const steps = page.getByRole('list', { name: 'Pasos' })
  await expect(steps).toContainText('Sentadilla trasera')
  await expect(steps).toContainText('Serie 1: 10 repeticiones · 35 kg')
  await expect(steps).toContainText('Descanso entre series: 2 min')
  await expect(steps).toContainText('Notas: Bajar la barra controlando.')
  await expect(page.locator('[data-version-details]')).toContainText('Fuerza')
})

test('a program version reads by week, each session on its version, linked to it', async ({
  page,
}) => {
  await installStudioApiMock(page, withPublishedProgram())
  await page.goto(CONTENT_PATH)
  await page.getByRole('tab', { name: 'Programas' }).click()

  await card(page, 'Hipertrofia de cuatro semanas')
    .getByRole('button', { name: /Ver versiones/ })
    .click()
  await page
    .getByRole('link', { name: 'Leer la versión 1 de Hipertrofia de cuatro semanas' })
    .click()

  await expect(page.getByRole('heading', { level: 1, name: 'Versión de programa' })).toBeVisible()
  await expect(page.locator('[data-version-details]')).toContainText(
    'Subir la carga cuando las ocho repeticiones salgan limpias.',
  )
  const firstWeek = page.getByRole('list', { name: 'Sesiones de la semana 1' })
  await expect(firstWeek).toContainText('Día 1 · Fuerza tren superior · versión 2')
  await expect(firstWeek).toContainText('Día 4 · Fuerza tren superior · versión 2')
  const secondWeek = page.getByRole('list', { name: 'Sesiones de la semana 2' })
  await expect(secondWeek).toContainText('Retirada')

  await secondWeek.getByRole('link', { name: 'Ver Fuerza tren superior, versión 1' }).click()
  await expect(page).toHaveURL(`${CONTENT_PATH}/templates/${publishedTemplate.id}/versions/1`)
  await expect(page.getByText('Serie 1: 10 repeticiones · 35 kg')).toBeVisible()
})

test('a session in the program editor opens the exact version it is fixed to', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}/programs/${draftedProgram.id}`)

  await page.getByRole('link', { name: 'Ver la versión 2' }).first().click()

  await expect(page).toHaveURL(`${CONTENT_PATH}/templates/${publishedTemplate.id}/versions/2`)
  await expect(page.getByText('Serie 1: 8 repeticiones · 40 kg')).toBeVisible()
})

test('a version outside the organization, or that never existed, reads as not found', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)

  await page.goto(`${CONTENT_PATH}/templates/${publishedTemplate.id}/versions/9`)
  await expect(page.getByText('No encontramos esta versión')).toBeVisible()

  // Not a version number at all: nothing is asked of the server.
  await page.goto(`${CONTENT_PATH}/programs/${draftedProgram.id}/versions/abc`)
  await expect(page.getByText('No encontramos esta versión')).toBeVisible()
  expect(fixture.requests.some((request) => request.path.endsWith('/versions/abc'))).toBe(false)
})

test('a read that fails says so and offers to try again', async ({ page }) => {
  const fixture = withPublishedProgram()
  // Down until the retry: a 503 is retried once on its own, so one failure never shows.
  let down = true
  fixture.intercept = (request) =>
    down && request.method === 'GET' && request.path.endsWith('/versions/1')
      ? { status: 503, body: problem('upstream-unavailable', 503) }
      : undefined
  await installStudioApiMock(page, fixture)
  await page.goto(`${CONTENT_PATH}/programs/${draftedProgram.id}/versions/1`)

  await expect(page.getByText('No pudimos abrir la versión')).toBeVisible()
  down = false
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByRole('list', { name: 'Sesiones de la semana 1' })).toBeVisible()
})
