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
  return page.locator('[data-program-grid-week]', {
    has: page.getByRole('heading', { name: `Semana ${number}`, exact: true }),
  })
}

/** One day of a week: a column of the grid, or a row of the list on a phone. */
function day(page: Page, weekNumber: number, dayNumber: number): Locator {
  return week(page, weekNumber)
    .locator('[data-program-day]')
    .nth(dayNumber - 1)
}

function sessions(scope: Locator): Locator {
  return scope.locator('[data-program-session]')
}

/** What the «+» of a day opens. */
async function openAdd(page: Page, weekNumber: number, dayNumber: number): Promise<Locator> {
  await page
    .getByRole('button', {
      name: `Agregar una sesión el día ${dayNumber} de la semana ${weekNumber}`,
    })
    .click()
  return page.getByRole('dialog', { name: 'Agregar una sesión' })
}

/** What a session opens when it is pressed. */
async function openSession(page: Page, session: Locator, title: string): Promise<Locator> {
  await session.getByRole('button').click()
  return page.getByRole('dialog', { name: title })
}

async function choose(page: Page, scope: Locator, label: string, option: string | RegExp) {
  await scope.getByLabel(label, { exact: true }).click()
  await page.getByRole('option', { name: option }).click()
}

function saveButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Guardar', exact: true })
}

test('a program is created from the content page and opens its empty draft', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(CONTENT_PATH)

  // One creation button, which follows the tab.
  await page.getByRole('tab', { name: 'Programas' }).click()
  await page.getByRole('button', { name: 'Nuevo programa' }).click()
  const form = page.getByRole('dialog', { name: 'Nuevo programa' })
  await form.getByLabel('Nombre').fill('  Fuerza para principiantes  ')
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

  // The address opens the library now, and the library is what refuses this role.
  await expect(page.getByText('No puedes consultar este contenido')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear programa' })).toHaveCount(0)
})

test('a draft opens from the library as a calendar, each session on an exact version', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(CONTENT_PATH)
  await page.getByRole('tab', { name: 'Programas' }).click()

  // Pressing the item opens its draft.
  await page.getByRole('link', { name: 'Hipertrofia de cuatro semanas', exact: true }).click()

  await expect(page).toHaveURL(EDITOR_PATH)
  await expect(page.getByLabel('Nombre')).toHaveValue('Hipertrofia de cuatro semanas')
  // A week is seven days, the empty ones included, and a session sits on its own.
  await expect(week(page, 1).locator('[data-program-day]')).toHaveCount(7)
  await expect(sessions(week(page, 1))).toHaveCount(2)
  await expect(sessions(day(page, 1, 1))).toContainText('Fuerza tren superior')
  await expect(sessions(day(page, 1, 1))).toContainText('Versión 2')
  await expect(sessions(day(page, 1, 4))).toContainText('Versión 2')
  await expect(sessions(day(page, 1, 2))).toHaveCount(0)
  // Criterion 3: the retired version stays, said on its session and above the grid.
  await expect(sessions(day(page, 2, 1))).toContainText('Versión 1')
  await expect(sessions(day(page, 2, 1))).toContainText('Retirada')
  await expect(page.locator('[data-program-retired]')).toContainText(
    'al publicarlo se te advertirá',
  )
})

test('only published versions are offered, each by number, the retired one disabled', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  const form = await openAdd(page, 1, 2)
  await expect(form).toContainText('Día 2 de la semana 1')
  // Criterion 2: a template with nothing but a draft has no version to name.
  await form.getByLabel('Plantilla', { exact: true }).click()
  await expect(page.getByRole('option', { name: 'Fuerza tren superior' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Movilidad matutina' })).toHaveCount(0)
  await page.getByRole('option', { name: 'Fuerza tren superior' }).click()
  await expect(form).toContainText('un borrador no se puede usar')

  // Criterion 1: the version is chosen by its number, newest first.
  await expect(form.getByLabel('Versión', { exact: true })).toContainText('Versión 2')
  await form.getByLabel('Versión', { exact: true }).click()
  await expect(page.getByRole('option', { name: /^Versión 1 .*retirada$/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

test('the only template there is comes chosen, on its newest version', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  const form = await openAdd(page, 1, 3)

  await expect(form.getByLabel('Plantilla', { exact: true })).toContainText('Fuerza tren superior')
  await expect(form.getByLabel('Versión', { exact: true })).toContainText('Versión 2')
  await expect(form.getByRole('button', { name: 'Agregar la sesión' })).toBeEnabled()
})

test('a session added and saved names its version, numbered in week and day order', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  // Nothing to save until something changes.
  await expect(saveButton(page)).toBeDisabled()
  const form = await openAdd(page, 1, 2)
  await form.getByRole('button', { name: 'Agregar la sesión' }).click()
  await expect(form).toHaveCount(0)
  await expect(sessions(day(page, 1, 2))).toContainText('Versión 2')
  await expect(sessions(week(page, 1))).toHaveCount(3)

  await saveButton(page).click()
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

  const panel = await openSession(page, sessions(day(page, 2, 1)), 'Fuerza tren superior')
  await choose(page, panel, 'Semana', 'Semana 3')

  // The week it left stays on screen, empty: a row never goes while it is being edited.
  await expect(sessions(week(page, 2))).toHaveCount(0)
  await expect(sessions(day(page, 3, 1))).toContainText('Versión 1')
  await expect(page.getByText('Hay cambios sin guardar.')).toBeVisible()
})

test('a session dragged to another day moves there, and is saved there', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await sessions(day(page, 1, 4)).dragTo(day(page, 1, 6))

  await expect(sessions(day(page, 1, 4))).toHaveCount(0)
  await expect(sessions(day(page, 1, 6))).toContainText('Versión 2')
  await saveButton(page).click()
  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()
  expect(saves(fixture)[0]?.body).toMatchObject({
    sessions: [
      { position: 1, week: 1, day: 1 },
      { position: 2, week: 1, day: 6 },
      { position: 3, week: 2, day: 1 },
    ],
  })
})

test('a week is added empty and takes its first session', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)
  await expect(week(page, 3)).toHaveCount(0)

  await page.getByRole('button', { name: 'Agregar semana' }).click()

  await expect(week(page, 3).locator('[data-program-day]')).toHaveCount(7)
  // An empty week is not a change yet: the draft stores sessions.
  await expect(page.getByText('Sin cambios desde que lo abriste.')).toBeVisible()
  const form = await openAdd(page, 3, 5)
  await form.getByRole('button', { name: 'Agregar la sesión' }).click()
  await expect(sessions(day(page, 3, 5))).toContainText('Fuerza tren superior')
  await expect(page.getByText('Hay cambios sin guardar.')).toBeVisible()
})

test('removing a session takes it out of its day', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  const panel = await openSession(page, sessions(day(page, 2, 1)), 'Fuerza tren superior')
  await panel.getByRole('button', { name: 'Quitar la sesión del día 1 de la semana 2' }).click()

  await expect(sessions(week(page, 2))).toHaveCount(0)
  await expect(page.locator('[data-program-retired]')).toHaveCount(0)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('a week is the list of its sessions, with one button that adds to it', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
    await page.goto(EDITOR_PATH)

    // Seven columns have no room: the empty days and their buttons are not shown.
    await expect(day(page, 1, 2)).toBeHidden()
    await expect(sessions(day(page, 1, 4))).toBeVisible()
    await week(page, 1).getByRole('button', { name: 'Agregar sesión' }).click()
    const form = page.getByRole('dialog', { name: 'Agregar una sesión' })
    // The day after the last one of the week, offered and still a choice.
    await expect(form.getByLabel('Día', { exact: true })).toContainText('Día 5')
    await choose(page, form, 'Día', 'Día 6')
    await form.getByRole('button', { name: 'Agregar la sesión' }).click()

    await expect(sessions(day(page, 1, 6))).toBeVisible()
    await expect(sessions(week(page, 1))).toHaveCount(3)
  })
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
  await saveButton(page).click()

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
  await saveButton(page).click()
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

  await expect(sessions(day(page, 1, 1))).toContainText('ya no está disponible')
  // «Guardar» is off until something changes, so the save needs a change to send.
  await page.getByLabel('Nombre').fill('Hipertrofia · bloque 2')
  await saveButton(page).click()

  await expect(page.locator('[data-program-save-issues]')).toContainText(
    'Una sesión usa una versión de plantilla que no es de esta organización o ya no existe.',
  )
})

test('a program that is not this organization’s reads as not found', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}/programs/01991600-9000-7000-8000-000000000999`)

  await expect(page.getByText('No encontramos este programa')).toBeVisible()
})
