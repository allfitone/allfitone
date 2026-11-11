import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  secondActiveMembership,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-036: creating a session template. Its three criteria are the
 * server's — the organization owns it with the caller as author, it exists
 * before anything is published, and it has one owner — so this audits what the
 * screen adds: the two questions the command asks, the capability gate, and an
 * answer for every refusal.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const NEW_PATH = `${CONTENT_PATH}/templates/new`

async function chooseDiscipline(page: Page, name: string) {
  await page.getByLabel('Disciplina').click()
  await page.getByRole('option', { name }).click()
}

function createRequests(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/session-templates'),
  )
}

test('a template is created from the content page and waits there as a draft', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(CONTENT_PATH)

  await page.getByRole('link', { name: 'Nueva plantilla' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Nueva plantilla' })).toBeVisible()

  await chooseDiscipline(page, 'Fuerza')
  await page.getByLabel('Nombre').fill('  Fuerza tren inferior  ')
  await page.getByRole('button', { name: 'Crear plantilla' }).click()

  await expect(page).toHaveURL(CONTENT_PATH)
  const created = page.locator('[data-content-register-item]', {
    hasText: 'Fuerza tren inferior',
  })
  await expect(created).toContainText('Borrador sin publicar')
  await expect(created).toContainText('Nada publicado todavía')

  const [sent] = createRequests(fixture)
  expect(sent?.body).toEqual({ discipline_code: 'strength', title: 'Fuerza tren inferior' })
  expect(sent?.headers['idempotency-key']).toBeTruthy()
  expect(sent?.headers['command-id']).toBeTruthy()
})

test('both questions are asked before anything is sent', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)

  await page.getByRole('button', { name: 'Crear plantilla' }).click()

  await expect(page.getByText('Elige la disciplina de la plantilla.')).toBeVisible()
  await expect(page.getByText('Escribe el nombre de la plantilla.')).toBeVisible()
  expect(createRequests(fixture)).toHaveLength(0)
})

test('the discipline is said to be final before it is chosen', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(NEW_PATH)

  await expect(page.getByText('No se cambia después.')).toBeVisible()
})

test('with no discipline published there is no form, and the reason is given', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership], disciplines: [] })
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)

  await expect(page.getByText('Todavía no hay disciplinas publicadas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear plantilla' })).toHaveCount(0)
})

test('a refusal from the server is explained and keeps what was typed', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    templateCreateOutcome: 'not-found',
  })
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)

  await chooseDiscipline(page, 'Movilidad')
  await page.getByLabel('Nombre').fill('Movilidad de cadera')
  await page.getByRole('button', { name: 'Crear plantilla' }).click()

  await expect(page.getByText(/Tu rol ya no crea contenido en esta organización/)).toBeVisible()
  await expect(page.getByLabel('Nombre')).toHaveValue('Movilidad de cadera')
  await expect(page).toHaveURL(NEW_PATH)
})

test('a role without manage_content is told so instead of seeing a form', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [secondActiveMembership] })
  fixture.organizationRoles = [
    {
      code: 'coach',
      name: 'Coach',
      description: null,
      capabilities: [
        { code: 'view_assigned_directory', name: 'Solo asignadas', description: null },
      ],
      fitness_data_access_policy: 'not_granted_by_role',
    },
  ]
  await installStudioApiMock(page, fixture)
  await page.goto(`/organizations/${secondActiveMembership.organization_id}/content/templates/new`)

  await expect(page.getByText('Tu rol no crea contenido')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear plantilla' })).toHaveCount(0)
})
