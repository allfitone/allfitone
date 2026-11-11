import { expect, test } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  problem,
  STRENGTH_GLOBAL_MOVEMENT_ID,
  STRENGTH_OWN_MOVEMENT_ID,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-065: correcting a movement of our own. Criterion 1 is that editing
 * never reinterprets history — once a published version uses the movement its
 * name accepts only case and spacing and its discipline is fixed — and
 * criterion 2 is that a global movement is never edited from here.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const OWN_PATH = `${CONTENT_PATH}/movements/${STRENGTH_OWN_MOVEMENT_ID}`

function edits(fixture: StudioApiFixture) {
  return fixture.requests.filter((request) => request.method === 'PATCH')
}

function locked(): StudioApiFixture {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.movements = fixture.movements.map((entry) =>
    entry.movement.id === STRENGTH_OWN_MOVEMENT_ID ? { ...entry, nameLocked: true } : entry,
  )
  return fixture
}

test('a correction sends only what changed, under the revision it read', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(CONTENT_PATH)
  await page.getByRole('tab', { name: 'Movimientos' }).click()
  await page.getByRole('link', { name: 'Abrir Remo con mancuerna a una mano' }).click()

  await page.getByLabel('Otros nombres').fill('Remo unilateral')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  await expect(page.getByText(/Cambios guardados a las/)).toBeVisible()
  await expect(page.locator('[data-movement-summary]')).toContainText('Remo unilateral')
  expect(edits(fixture)[0]?.body).toEqual({ expected_revision: 1, aliases: ['Remo unilateral'] })
})

test('nothing changed is said, and nothing is sent', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(OWN_PATH)

  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  await expect(page.getByText('No hay cambios que guardar.')).toBeVisible()
  expect(edits(fixture)).toHaveLength(0)
})

test('once a published version uses it, the name keeps its meaning and the discipline stays', async ({
  page,
}) => {
  const fixture = locked()
  await installStudioApiMock(page, fixture)
  await page.goto(OWN_PATH)

  await expect(page.getByLabel('Disciplina', { exact: true })).toBeDisabled()
  await page.getByLabel('Nombre', { exact: true }).fill('Remo con kettlebell')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(
    page.getByText(
      'Una versión publicada ya lo usa: el nombre solo admite cambios de mayúsculas o espacios.',
    ),
  ).toBeVisible()
  expect(edits(fixture)).toHaveLength(0)

  // Case and spacing still change, because the meaning does not.
  await page.getByLabel('Nombre', { exact: true }).fill('Remo con Mancuerna a una mano')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText(/Cambios guardados a las/)).toBeVisible()
  expect(edits(fixture)[0]?.body).toEqual({
    expected_revision: 1,
    name: 'Remo con Mancuerna a una mano',
  })
})

test('a rename the server refuses because of history is said on the name', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  // A version published since the page was read: only the server knows it yet.
  fixture.intercept = (request) =>
    request.method === 'PATCH'
      ? {
          status: 409,
          body: problem('conflict', 409, {
            errors: [{ code: 'movement-in-use', path: '', message: 'x' }],
          }),
        }
      : undefined
  await installStudioApiMock(page, fixture)
  await page.goto(OWN_PATH)

  await page.getByLabel('Nombre', { exact: true }).fill('Remo con kettlebell')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  await expect(
    page.getByText(/Una versión publicada ya lo usa: el nombre solo admite/),
  ).toBeVisible()
})

test('a name another of ours has is refused on the name', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(OWN_PATH)

  await page.getByLabel('Nombre', { exact: true }).fill('zancada lateral con banda')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  await expect(
    page.getByText('Ya hay un movimiento de tu organización con ese nombre.'),
  ).toBeVisible()
})

test('two people editing: the current movement is shown beside the unsaved change', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    movementEditOutcome: 'stale',
  })
  await installStudioApiMock(page, fixture)
  await page.goto(OWN_PATH)

  await page.getByLabel('Otros nombres').fill('Remo unilateral')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  const conflict = page.locator('[data-movement-conflict]')
  await expect(conflict).toContainText('1 nombre alternativo')
  await expect(page.getByLabel('Otros nombres')).toHaveValue('Remo unilateral')
  await conflict.getByRole('button', { name: 'Guardar mis cambios encima' }).click()

  await expect(page.getByText(/Cambios guardados a las/)).toBeVisible()
  expect(edits(fixture)[1]?.body).toEqual({ expected_revision: 2, aliases: ['Remo unilateral'] })
})

test('a global movement is read here and never edited', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}/movements/${STRENGTH_GLOBAL_MOVEMENT_ID}`)

  await expect(page.getByText(/no se editan desde aquí/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
})

test('an archived movement of ours is read, not edited', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}/movements/01991600-c000-7000-8000-000000000004`)

  await expect(page.getByText(/Está archivado: ya no se edita/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
})
