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
 *
 * The form is a dialog over the library. The address that used to be its page
 * still opens it, so a link kept from before lands on the same two questions.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const NEW_PATH = `${CONTENT_PATH}/templates/new`

function form(page: Page) {
  return page.getByRole('dialog', { name: 'Nueva plantilla' })
}

// Scoped to the dialog: the list behind it has a discipline filter of its own.
async function chooseDiscipline(page: Page, name: string) {
  await form(page).getByLabel('Disciplina').click()
  await page.getByRole('option', { name }).click()
}

function createRequests(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/session-templates'),
  )
}

test('a template is created from the content page, opens its draft and waits as one', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(CONTENT_PATH)

  await page.getByRole('button', { name: 'Nueva plantilla' }).click()
  await expect(form(page)).toBeVisible()
  // The list stays where it was, behind the two questions.
  await expect(page).toHaveURL(CONTENT_PATH)

  await chooseDiscipline(page, 'Fuerza')
  await form(page).getByLabel('Nombre').fill('  Fuerza tren inferior  ')
  await page.getByRole('button', { name: 'Crear plantilla' }).click()

  // Criterion 2: the template exists, with its draft, before anything is published.
  await expect(page.getByRole('heading', { level: 1, name: 'Plantilla' })).toBeVisible()
  await expect(page.getByLabel('Nombre')).toHaveValue('Fuerza tren inferior')

  await page.getByRole('link', { name: 'Volver a la biblioteca' }).click()
  await expect(page).toHaveURL(CONTENT_PATH)
  const created = page.locator('[data-library-card]', { hasText: 'Fuerza tren inferior' })
  await expect(created.locator('[data-library-status]')).toHaveText('Borrador')
  // Nothing published, so there is no version to list.
  await expect(created.getByRole('button', { name: /Versiones de/ })).toHaveCount(0)

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
  await form(page).getByLabel('Nombre').fill('Movilidad de cadera')
  await page.getByRole('button', { name: 'Crear plantilla' }).click()

  await expect(page.getByText(/Tu rol ya no crea contenido en esta organización/)).toBeVisible()
  // Still open, with what was typed: a refusal closes nothing.
  await expect(form(page).getByLabel('Nombre')).toHaveValue('Movilidad de cadera')
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

  // The address opens the library now, and the library is what refuses this role.
  await expect(page.getByText('No puedes consultar este contenido')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear plantilla' })).toHaveCount(0)
})
