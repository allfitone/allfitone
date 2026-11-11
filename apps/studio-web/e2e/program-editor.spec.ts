import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  draftedProgram,
  installStudioApiMock,
  secondActiveMembership,
  STRENGTH_TEMPLATE_V1_ID,
  STRENGTH_TEMPLATE_V2_ID,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-041: creating and editing a program. The three criteria, as this
 * audits them: every session names one exact template version by number, only
 * published versions can be added (a template draft cannot), and a retired
 * version already in the program stays editable and is named before publishing.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const EDITOR_PATH = `${CONTENT_PATH}/programs/${draftedProgram.id}`

function saves(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'PUT' && request.path.endsWith('/draft'),
  )
}

function week(page: Page, number: number): Locator {
  return page.locator('[data-program-week]', {
    has: page.getByRole('heading', { name: `Semana ${number}`, exact: true }),
  })
}

function addCard(page: Page): Locator {
  return page.locator('[data-program-add-session]')
}

async function choose(page: Page, scope: Locator, label: string, option: string | RegExp) {
  await scope.getByLabel(label, { exact: true }).click()
  await page.getByRole('option', { name: option }).click()
}

test('a program is created from the content page and opens its empty draft', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(CONTENT_PATH)

  await page.getByRole('link', { name: 'Nuevo programa' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Nuevo programa' })).toBeVisible()
  await page.getByLabel('Nombre').fill('  Fuerza para principiantes  ')
  await page.getByRole('button', { name: 'Crear programa' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Programa' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${CONTENT_PATH}/programs/[0-9a-f-]+$`))
  await expect(page.getByLabel('Nombre')).toHaveValue('Fuerza para principiantes')
  await expect(page.getByText('Todavía no hay sesiones.', { exact: false })).toBeVisible()
  const created = fixture.requests.find(
    (request) => request.method === 'POST' && request.path.endsWith('/programs'),
  )
  expect(created?.body).toEqual({ title: 'Fuerza para principiantes' })
})

test('the name is asked for before anything is sent', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(`${CONTENT_PATH}/programs/new`)

  await page.getByRole('button', { name: 'Crear programa' }).click()

  await expect(page.getByText('Escribe el nombre del programa.')).toBeVisible()
  expect(fixture.requests.some((request) => request.method === 'POST')).toBe(false)
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
  await page.goto(`/organizations/${secondActiveMembership.organization_id}/content/programs/new`)

  await expect(page.getByText('Tu rol no crea contenido')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear programa' })).toHaveCount(0)
})

test('a draft opens from the library, by week, each session on an exact version', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(CONTENT_PATH)
  await page.getByRole('tab', { name: 'Programas' }).click()

  await page
    .locator('[data-content-register-item]', { hasText: 'Hipertrofia de cuatro semanas' })
    .getByRole('link', { name: 'Abrir el borrador' })
    .click()

  await expect(page).toHaveURL(EDITOR_PATH)
  await expect(page.getByLabel('Nombre')).toHaveValue('Hipertrofia de cuatro semanas')
  await expect(week(page, 1).locator('[data-program-session]')).toHaveCount(2)
  await expect(week(page, 1)).toContainText('Día 1 · Fuerza tren superior · versión 2')
  await expect(week(page, 1)).toContainText('Día 4 · Fuerza tren superior · versión 2')
  // Criterion 3: the retired version stays, said on its session and above the list.
  await expect(week(page, 2)).toContainText('Fuerza tren superior · versión 1')
  await expect(week(page, 2)).toContainText('Retirada')
  await expect(page.locator('[data-program-retired]')).toContainText(
    'al publicarlo se te advertirá',
  )
})

test('only published versions are offered, each by number, the retired one disabled', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  // Criterion 2: a template with nothing but a draft has no version to name.
  await addCard(page).getByLabel('Plantilla', { exact: true }).click()
  await expect(page.getByRole('option', { name: 'Fuerza tren superior' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Movilidad matutina' })).toHaveCount(0)
  await page.getByRole('option', { name: 'Fuerza tren superior' }).click()
  await expect(addCard(page)).toContainText('un borrador no se puede usar')

  // Criterion 1: the version is chosen by its number, newest first.
  await expect(addCard(page).getByLabel('Versión', { exact: true })).toContainText('Versión 2')
  await addCard(page).getByLabel('Versión', { exact: true }).click()
  await expect(page.getByRole('option', { name: /^Versión 1 .*retirada$/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

test('a session added and saved names its version, numbered in week and day order', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await choose(page, addCard(page), 'Plantilla', 'Fuerza tren superior')
  await choose(page, addCard(page), 'Semana', 'Semana 1')
  await choose(page, addCard(page), 'Día', 'Día 2')
  await addCard(page).getByRole('button', { name: 'Agregar la sesión' }).click()
  await expect(week(page, 1).locator('[data-program-session]')).toHaveCount(3)

  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()

  const [sent] = saves(fixture)
  expect(sent?.headers['if-match']).toBe(draftedProgram.draft.etag)
  expect(sent?.body).toMatchObject({
    title: 'Hipertrofia de cuatro semanas',
    repeats_forever: false,
    sessions: [
      { position: 1, week: 1, day: 1, template_version_id: STRENGTH_TEMPLATE_V2_ID },
      { position: 2, week: 1, day: 2, template_version_id: STRENGTH_TEMPLATE_V2_ID },
      { position: 3, week: 1, day: 4, template_version_id: STRENGTH_TEMPLATE_V2_ID },
      // The retired version stays where it was: the server refuses only a new one.
      { position: 4, week: 2, day: 1, template_version_id: STRENGTH_TEMPLATE_V1_ID },
    ],
  })
})

test('a session moved to another week moves in the program', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  const retired = page.locator('[data-program-session]', { hasText: 'versión 1' })
  await choose(page, retired, 'Semana', 'Semana 3')

  await expect(week(page, 2)).toHaveCount(0)
  await expect(week(page, 3)).toContainText('Fuerza tren superior · versión 1')
  await expect(page.getByText('Hay cambios sin guardar.')).toBeVisible()
})

test('removing a session takes it out of its week', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  await page.getByRole('button', { name: 'Quitar la sesión del día 1 de la semana 2' }).click()

  await expect(week(page, 2)).toHaveCount(0)
  await expect(page.locator('[data-program-retired]')).toHaveCount(0)
})

test('two people saving at once: one sees the current draft and keeps their work', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    programDraftSaveOutcome: 'stale',
  })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await page.getByLabel('Nombre').fill('Hipertrofia · bloque 2')
  await page.getByRole('button', { name: 'Guardar borrador' }).click()

  const conflict = page.locator('[data-program-conflict]')
  await expect(conflict).toContainText('Hipertrofia de cuatro semanas (versión del equipo)')
  await expect(conflict).toContainText('3 sesiones')
  await expect(page.getByLabel('Nombre')).toHaveValue('Hipertrofia · bloque 2')

  await conflict.getByRole('button', { name: 'Guardar mis cambios encima' }).click()
  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()
  const [, second] = saves(fixture)
  expect(second?.body).toMatchObject({ title: 'Hipertrofia · bloque 2' })
})

test('the current draft can be loaded instead, dropping the unsaved work', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [activeMembership], programDraftSaveOutcome: 'stale' }),
  )
  await page.goto(EDITOR_PATH)

  await page.getByLabel('Nombre').fill('Hipertrofia · bloque 2')
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await page.getByRole('button', { name: 'Cargar lo guardado' }).click()

  await expect(page.getByLabel('Nombre')).toHaveValue(
    'Hipertrofia de cuatro semanas (versión del equipo)',
  )
  await expect(page.locator('[data-program-conflict]')).toHaveCount(0)
})

test('what the server refuses on save is said in the reader’s words', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  // A version that is not this organization's, which only the server can tell.
  fixture.organizationPrograms = [
    {
      ...structuredClone(draftedProgram),
      draft: {
        ...structuredClone(draftedProgram.draft),
        content: {
          ...structuredClone(draftedProgram.draft.content),
          sessions: [
            {
              position: 1,
              week: 1,
              day: 1,
              template_version_id: '01991600-a000-7000-8000-000000000999',
            },
          ],
        },
      },
    },
  ]
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await expect(week(page, 1)).toContainText('ya no está disponible')
  await page.getByRole('button', { name: 'Guardar borrador' }).click()

  await expect(page.locator('[data-program-save-issues]')).toContainText(
    'Una sesión usa una versión de plantilla que no es de esta organización o ya no existe.',
  )
})

test('a program that is not this organization’s reads as not found', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}/programs/01991600-9000-7000-8000-000000000999`)

  await expect(page.getByText('No encontramos este programa')).toBeVisible()
})
