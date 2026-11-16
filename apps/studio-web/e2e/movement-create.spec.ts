import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  secondActiveMembership,
  STRENGTH_GLOBAL_MOVEMENT_ID,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-064: creating a movement of our own. Criteria 1 and 5 are the
 * server's and said on the form (only we see it, and nothing uploads it to the
 * global catalogue); criterion 2 is the variant field, held to the global
 * library; criterion 3 is a discipline list made only of what Allfit
 * published; criterion 4 is a repeated name refused on the name field.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`
const NEW_PATH = `${CONTENT_PATH}/movements/new`

function creations(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/movements'),
  )
}

async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('a movement is created from the movements tab and opens as ours alone', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(CONTENT_PATH)
  await page.getByRole('tab', { name: 'Movimientos' }).click()

  await page.getByRole('link', { name: 'Nuevo movimiento' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Nuevo movimiento' })).toBeVisible()
  await choose(page, 'Disciplina', 'Fuerza')
  await page.getByLabel('Nombre', { exact: true }).fill('  Remo   invertido ')
  await page.getByLabel('Otros nombres').fill('Remo australiano\n\n')
  await page.getByRole('button', { name: 'Crear movimiento' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Movimiento' })).toBeVisible()
  await expect(page.getByText(/Solo lo ve tu organización/)).toBeVisible()
  const summary = page.locator('[data-movement-summary]')
  await expect(summary).toContainText('Remo invertido')
  await expect(summary).toContainText('Propio')
  await expect(summary).toContainText('Remo australiano')
  const [sent] = creations(fixture)
  expect(sent?.body).toEqual({
    discipline_code: 'strength',
    name: 'Remo invertido',
    aliases: ['Remo australiano'],
    variant: null,
  })
  // The server takes the command id as the movement's id, and the page opens it.
  await expect(page).toHaveURL(`${CONTENT_PATH}/movements/${sent?.headers['command-id']}`)
})

test('it can be a variant of a global movement, and of nothing else', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)

  await expect(
    page.getByRole('button', { name: 'Elegir un movimiento del catálogo' }),
  ).toBeDisabled()
  await choose(page, 'Disciplina', 'Fuerza')
  await page.getByLabel('Nombre', { exact: true }).fill('Press con pausa')
  await page.getByRole('button', { name: 'Elegir un movimiento del catálogo' }).click()

  const picker = page.getByRole('dialog', { name: 'Elegir un movimiento' })
  await expect(picker.getByRole('button', { name: 'Press de banca' })).toBeVisible()
  // Our own movement is not a base a variant can name.
  await expect(picker.getByRole('button', { name: 'Remo con mancuerna a una mano' })).toHaveCount(0)
  await picker.getByRole('button', { name: 'Press de banca' }).click()
  await choose(page, 'Relación', 'Progresión')
  await page.getByRole('button', { name: 'Crear movimiento' }).click()

  await expect(page.locator('[data-movement-summary]')).toContainText(
    'Progresión de Press de banca',
  )
  expect(creations(fixture)[0]?.body).toMatchObject({
    variant: {
      movement_id: '01991600-c000-7000-8000-000000000002',
      relation: 'progression',
      note: null,
    },
  })
})

test('a repeated name is refused on the name, and nothing is duplicated', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)
  const before = fixture.movements.length

  await choose(page, 'Disciplina', 'Fuerza')
  // The same name as ours in another case and spacing is the same name.
  await page.getByLabel('Nombre', { exact: true }).fill('remo con  MANCUERNA a una mano')
  await page.getByRole('button', { name: 'Crear movimiento' }).click()

  await expect(
    page.getByText('Ya hay un movimiento de tu organización con ese nombre.'),
  ).toBeVisible()
  await expect(page).toHaveURL(NEW_PATH)
  expect(fixture.movements).toHaveLength(before)
})

test('only what Allfit published can be chosen, and nothing goes to the global catalogue', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(NEW_PATH)

  await expect(page.getByText(/no hay forma de subirlo al catálogo de Allfit/)).toBeVisible()
  await expect(page.getByText(/Las disciplinas las publica Allfit/)).toBeVisible()
  await page.getByLabel('Disciplina', { exact: true }).click()
  await expect(page.getByRole('option')).toHaveText(['Fuerza', 'Movilidad'])
})

test('what is missing or repeated is said before anything is sent', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)

  await page.getByLabel('Otros nombres').fill('Remo\nremo')
  await page.getByRole('button', { name: 'Crear movimiento' }).click()

  await expect(page.getByText('Elige la disciplina del movimiento.')).toBeVisible()
  await expect(page.getByText('Escribe el nombre del movimiento.')).toBeVisible()
  await expect(
    page.getByText('Un nombre alternativo no puede repetir el nombre ni otro nombre alternativo.'),
  ).toBeVisible()
  expect(creations(fixture)).toHaveLength(0)
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
  await page.goto(`/organizations/${secondActiveMembership.organization_id}/content/movements/new`)

  await expect(page.getByText('Tu rol no crea contenido')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear movimiento' })).toHaveCount(0)
})

test('a global movement opens from the tab and says it is Allfit’s', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(CONTENT_PATH)
  await page.getByRole('tab', { name: 'Movimientos' }).click()

  await page.getByRole('link', { name: 'Abrir Sentadilla trasera' }).click()

  await expect(page).toHaveURL(`${CONTENT_PATH}/movements/${STRENGTH_GLOBAL_MOVEMENT_ID}`)
  await expect(page.getByText(/Un movimiento del catálogo de Allfit/)).toBeVisible()
  await expect(page.locator('[data-movement-summary]')).toContainText('Back squat')
})
