import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  problem,
  publishedTemplate,
  STRENGTH_ACTIVITY_TYPE_ID,
  STRENGTH_GLOBAL_MOVEMENT_ID,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-037: editing a template's draft. Criteria 1 and 2 are the server's
 * (there is no write route for a version, and a program never names a draft).
 * This audits the two that are the screen's as much as the server's: a step's
 * targets fit the declared activity type, and two people saving at once end
 * with one of them shown the current draft and a warning instead of losing work.
 *
 * The steps are lines that open. A step is read closed, by its summary, and
 * written open, so every test that writes in one opens it first.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const EDITOR_PATH = `${CONTENT_PATH}/templates/${publishedTemplate.id}`

function saves(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'PUT' && request.path.endsWith('/draft'),
  )
}

function step(page: Page, position: number) {
  return page
    .getByRole('list', { name: 'Pasos' })
    .locator(':scope > li')
    .nth(position - 1)
}

/** The line of a step is its heading, and the button in it opens and closes it. */
function stepLine(page: Page, position: number) {
  return step(page, position).getByRole('heading').getByRole('button')
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
}

async function stepOption(page: Page, position: number, option: string) {
  await page.getByRole('button', { name: `Opciones del paso ${position}` }).click()
  await page.getByRole('menuitem', { name: option }).click()
}

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label, { exact: true }).click()
  await page.getByRole('option', { name: option }).click()
}

async function createTemplate(page: Page, title: string) {
  await page.goto(`${CONTENT_PATH}/templates/new`)
  // Scoped to the dialog: the list behind it has a discipline filter of its own.
  const form = page.getByRole('dialog', { name: 'Nueva plantilla' })
  await form.getByLabel('Disciplina').click()
  await page.getByRole('option', { name: 'Fuerza' }).click()
  await form.getByLabel('Nombre').fill(title)
  await page.getByRole('button', { name: 'Crear plantilla' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Plantilla' })).toBeVisible()
}

test('a draft opens from the library with its steps as they were written', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(CONTENT_PATH)

  // Pressing the item opens its draft.
  await page.getByRole('link', { name: 'Fuerza tren superior', exact: true }).click()

  await expect(page).toHaveURL(EDITOR_PATH)
  await expect(page.getByLabel('Nombre')).toHaveValue('Fuerza tren superior')
  // Closed, a step is one line: its movement and what it asks for.
  await expect(stepLine(page, 1)).toContainText('Sentadilla trasera')
  await expect(stepLine(page, 1)).toContainText('3 series · 8 reps · 40 kg')
  await expect(step(page, 1).getByLabel('Repeticiones')).toHaveCount(0)

  await stepLine(page, 1).click()
  await expect(step(page, 1).getByLabel('Repeticiones')).toHaveCount(3)
  await expect(step(page, 1).getByLabel('Carga (kg)').first()).toHaveValue('40')

  await stepLine(page, 1).click()
  await expect(step(page, 1).getByLabel('Repeticiones')).toHaveCount(0)
})

test('the trail leads back to the list of templates', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  const trail = page.getByRole('navigation', { name: 'Ruta' })
  await expect(trail).toContainText('Fuerza tren superior')
  await trail.getByRole('link', { name: 'Plantillas' }).click()

  // Templates are the tab the library opens on, so its address names none.
  await expect(page).toHaveURL(CONTENT_PATH)
  await expect(page.getByRole('tab', { name: /Plantillas/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('a save sends the whole draft, conditioned on the draft it started from', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  // Nothing to save yet, so the button waits.
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled()
  await page.getByLabel('Nombre').fill('Fuerza tren superior · bloque 2')
  await stepLine(page, 1).click()
  await step(page, 1).getByLabel('Carga (kg)').first().fill('42,5')
  await expect(page.getByText('Hay cambios sin guardar.')).toBeVisible()
  // The line follows what is typed in the step under it.
  await expect(stepLine(page, 1)).toContainText('3 series · 8 reps · 40–42,5 kg')
  await save(page)

  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()
  const [sent] = saves(fixture)
  expect(sent?.headers['if-match']).toBe(publishedTemplate.draft.etag)
  expect(sent?.body).toMatchObject({
    title: 'Fuerza tren superior · bloque 2',
    activity_type_id: STRENGTH_ACTIVITY_TYPE_ID,
    steps: [
      {
        position: 1,
        movement_id: STRENGTH_GLOBAL_MOVEMENT_ID,
        target: {
          family: 'strength',
          sets: [{ set_order: 1, target_load_value: 42.5, target_load_unit_code: 'kg' }, {}, {}],
          target_rest_seconds: 90,
        },
      },
    ],
  })
})

test('a new template is built from its activity type, then its steps', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await createTemplate(page, 'Pierna')

  // Criterion 3: no family yet, so no step can be written.
  await expect(page.getByText('Elige un tipo de actividad para poder agregar pasos.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar paso' })).toBeDisabled()

  await choose(page, 'Tipo de actividad', /Fuerza en gimnasio/)
  await page.getByRole('button', { name: 'Agregar paso' }).click()

  // The step just added is the one about to be written, so it arrives open.
  await expect(stepLine(page, 1)).toContainText('Sin movimiento')
  await step(page, 1).getByRole('button', { name: 'Elegir un movimiento' }).click()
  const picker = page.getByRole('dialog', { name: 'Elegir un movimiento' })
  await picker.getByLabel('Buscar').fill('sentadilla')
  await picker.getByRole('option', { name: 'Sentadilla trasera' }).click()
  await expect(stepLine(page, 1)).toContainText('Sentadilla trasera')

  await step(page, 1).getByLabel('Repeticiones').fill('10')
  await save(page)
  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()

  const lastSearch = fixture.requests
    .filter((request) => request.path.endsWith('/movements'))
    .map((request) => new URLSearchParams(request.search))
    .at(-1)
  // Held to the template's discipline, and never offering what was archived.
  expect(lastSearch?.get('discipline')).toBe('strength')
  expect(lastSearch?.get('include_archived')).toBeNull()
  expect(saves(fixture).at(-1)?.body).toMatchObject({
    title: 'Pierna',
    activity_type_id: STRENGTH_ACTIVITY_TYPE_ID,
    steps: [
      {
        position: 1,
        movement_id: STRENGTH_GLOBAL_MOVEMENT_ID,
        target: { family: 'strength', sets: [{ set_order: 1, kind: 'normal', target_reps: 10 }] },
      },
    ],
  })
})

test('the movement search is moved through with the keyboard', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  await stepOption(page, 1, 'Cambiar el movimiento')
  const picker = page.getByRole('dialog', { name: 'Elegir un movimiento' })
  // Whose each movement is stays in sight beside its name.
  await expect(picker.getByRole('option', { name: 'Press de banca' })).toContainText(
    'Catálogo de Allfit',
  )
  await picker.getByLabel('Buscar').fill('remo')
  // The mark follows the results: the one left is the one Enter chooses.
  await expect(picker.getByRole('option')).toHaveCount(1)
  await expect(picker.getByRole('option')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')

  await expect(picker).toHaveCount(0)
  await expect(stepLine(page, 1)).toContainText('Remo con mancuerna a una mano')
})

test('a set is added as a copy of the last one, and removed by its own button', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)
  await stepLine(page, 1).click()

  await step(page, 1).getByRole('button', { name: 'Agregar serie' }).click()
  await expect(step(page, 1).getByLabel('Repeticiones')).toHaveCount(4)
  await expect(step(page, 1).getByLabel('Carga (kg)').nth(3)).toHaveValue('40')
  await expect(stepLine(page, 1)).toContainText('4 series · 8 reps · 40 kg')

  await step(page, 1).getByRole('button', { name: 'Quitar la serie 4' }).click()
  await expect(step(page, 1).getByLabel('Repeticiones')).toHaveCount(3)
})

test('an interval type offers rounds and work, never sets', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await createTemplate(page, 'Circuito')

  await choose(page, 'Tipo de actividad', /Circuito por intervalos/)
  await page.getByRole('button', { name: 'Agregar paso' }).click()

  await expect(step(page, 1).getByLabel('Tipo de serie')).toHaveCount(0)
  await step(page, 1).getByLabel('Rondas').fill('8')
  await step(page, 1).getByLabel('Trabajo (s)').fill('30')
  // The line of the step reads its targets in the words of its family.
  await expect(stepLine(page, 1)).toContainText('8 rondas · 30 s de trabajo')
})

test('a type without targets, or of another family once steps exist, cannot be chosen', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)

  await page.getByLabel('Tipo de actividad', { exact: true }).click()
  await expect(page.getByRole('option', { name: /Pliometría/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(page.getByRole('option', { name: /Circuito por intervalos/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

test('a value the server would refuse is named on its step and nothing is sent', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await stepLine(page, 1).click()
  await step(page, 1).getByLabel('Esfuerzo (RPE)').first().fill('12')
  // Closed again: the step that cannot be saved has to open by itself.
  await stepLine(page, 1).click()
  await expect(step(page, 1).getByLabel('Esfuerzo (RPE)')).toHaveCount(0)
  await save(page)

  await expect(step(page, 1)).toContainText('Serie 1: el esfuerzo percibido va de 0 a 10.')
  await expect(step(page, 1)).toContainText('Revisar')
  await expect(page.getByText('el borrador no se guardó')).toBeVisible()
  expect(saves(fixture)).toHaveLength(0)
})

test('steps reorder, and the order saved is the order shown', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await page.getByRole('button', { name: 'Agregar paso' }).click()
  await step(page, 2).getByLabel('Notas').fill('Segundo')
  await stepOption(page, 2, 'Subir')
  // It moves with what was written in it, and stays open.
  await expect(step(page, 1).getByLabel('Notas')).toHaveValue('Segundo')
  await save(page)
  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()

  const body = saves(fixture).at(-1)?.body as {
    steps: Array<{ position: number; notes: string | null }>
  }
  expect(body.steps.map((saved) => [saved.position, saved.notes])).toEqual([
    [1, 'Segundo'],
    [2, null],
  ])
})

test('the first step cannot go up, the last cannot go down, and one can be removed', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(EDITOR_PATH)
  await page.getByRole('button', { name: 'Agregar paso' }).click()

  await page.getByRole('button', { name: 'Opciones del paso 1' }).click()
  await expect(page.getByRole('menuitem', { name: 'Subir' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Opciones del paso 2' }).click()
  await expect(page.getByRole('menuitem', { name: 'Bajar' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.getByRole('menuitem', { name: 'Quitar el paso' }).click()

  await expect(page.getByRole('list', { name: 'Pasos' }).locator(':scope > li')).toHaveCount(1)
  await expect(stepLine(page, 1)).toContainText('Sentadilla trasera')
})

/*
 * Criterion 4. The save meets a draft somebody else saved first: the screen
 * shows what is saved now, keeps the unsaved work, and the coach decides.
 */
test('two people saving at once: one sees the current draft and keeps their work', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    draftSaveOutcome: 'stale',
  })
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await page.getByLabel('Nombre').fill('Mi versión')
  await save(page)

  const conflict = page.locator('[data-template-conflict]')
  await expect(conflict).toContainText('Alguien guardó este borrador mientras lo editabas')
  await expect(conflict).toContainText('«Fuerza tren superior (versión del equipo)»')
  await expect(page.getByLabel('Nombre')).toHaveValue('Mi versión')

  await conflict.getByRole('button', { name: 'Guardar mis cambios encima' }).click()
  await expect(page.getByText(/Borrador guardado a las/)).toBeVisible()
  await expect(conflict).toHaveCount(0)

  const [first, second] = saves(fixture)
  expect(first?.headers['if-match']).toBe(publishedTemplate.draft.etag)
  expect(second?.headers['if-match']).not.toBe(publishedTemplate.draft.etag)
  expect(second?.body).toMatchObject({ title: 'Mi versión' })
})

test('the current draft can be loaded instead, dropping the unsaved work', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [activeMembership], draftSaveOutcome: 'stale' }),
  )
  await page.goto(EDITOR_PATH)

  await page.getByLabel('Nombre').fill('Mi versión')
  await save(page)
  await page.getByRole('button', { name: 'Cargar lo guardado' }).click()

  await expect(page.getByLabel('Nombre')).toHaveValue('Fuerza tren superior (versión del equipo)')
  await expect(page.locator('[data-template-conflict]')).toHaveCount(0)
})

test('what the server refuses on save is said in the reader’s words', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.intercept = (request) =>
    request.method === 'PUT' && request.path.endsWith('/draft')
      ? {
          status: 422,
          body: problem('validation-failed', 422, {
            errors: [{ code: 'movement', path: '/steps/0/movement_id', message: 'x' }],
          }),
        }
      : undefined
  await installStudioApiMock(page, fixture)
  await page.goto(EDITOR_PATH)

  await page.getByLabel('Nombre').fill('Otro nombre')
  await save(page)

  await expect(page.getByText('El servidor no aceptó el borrador')).toBeVisible()
  await expect(
    page.getByText('Un movimiento ya no está disponible o no es de la disciplina de la plantilla.'),
  ).toBeVisible()
  await expect(page.getByLabel('Nombre')).toHaveValue('Otro nombre')
})

test('a template that is not this organization’s reads as not found', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}/templates/01991600-a000-7000-8000-000000000999`)

  await expect(page.getByText('No encontramos esta plantilla')).toBeVisible()
})
