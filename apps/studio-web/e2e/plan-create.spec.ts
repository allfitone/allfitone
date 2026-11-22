import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  MONTHLY_PLAN_ID,
  problem,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-074: creating a plan, and renaming one. Criterion 1, a name before
 * a price, is the dialog saving the name alone when no price is given;
 * criterion 2, a draft sold to nobody, is said on the plan it lands on;
 * criterion 3, no two plans with one name, is the server's 409 said on the
 * name field. The dialog can also publish the first price in the same step,
 * which is two commands: the plan, then its price.
 */

const BILLING_PATH = `/organizations/${activeMembership.organization_id}/billing`
const PLANS_TAB = `${BILLING_PATH}?tab=plans`
// The address the form used to have: it opens the dialog over the plans.
const NEW_PATH = `${BILLING_PATH}/plans/new`
const MONTHLY_PATH = `${BILLING_PATH}/plans/${MONTHLY_PLAN_ID}`

function writes(fixture: StudioApiFixture, method: 'POST' | 'PATCH') {
  return fixture.requests.filter(
    (request) => request.method === method && /\/plans(\/[^/]+)?$/.test(request.path),
  )
}

function publishes(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/versions'),
  )
}

function asCoach() {
  return createStudioApiFixture({ memberships: [{ ...activeMembership, roles: ['coach'] }] })
}

function createDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Nuevo plan' })
}

test('an owner creates a plan from Cobros and lands on it, a draft nobody can buy', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(BILLING_PATH)

  // Offered where the plans are, not over the list of who pays.
  await expect(page.locator('[data-billing-row]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo plan' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Planes' }).click()
  await page.getByRole('button', { name: 'Nuevo plan' }).click()
  const dialog = createDialog(page)
  // Criterion 2, before the click: without a price nobody can subscribe.
  await expect(dialog).toContainText('Sin precio queda en borrador')
  await dialog.getByLabel('Nombre').fill('  Trimestral  ')
  await dialog.getByRole('button', { name: 'Guardar sin precio' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${BILLING_PATH}/plans/[0-9a-f-]+$`))
  await expect(page.getByLabel('Nombre')).toHaveValue('Trimestral')
  await expect(page.locator('[data-plan-state]')).toHaveText('Borrador')
  await expect(page.locator('[data-plan-summary]')).toContainText(
    'Todavía no tiene precio, así que nadie puede suscribirse.',
  )
  expect(writes(fixture, 'POST')[0]?.body).toEqual({ name: 'Trimestral' })
  expect(publishes(fixture)).toHaveLength(0)
})

test('a plan is created and put on sale in one step, and the dialog says what that does', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(PLANS_TAB)

  await page.getByRole('button', { name: 'Nuevo plan' }).click()
  const dialog = createDialog(page)
  await dialog.getByLabel('Nombre').fill('Dos veces por semana')
  await dialog.getByLabel('Precio en pesos colombianos (COP)').fill('70000')
  // Read back as it will stand, because a published price is never edited.
  await expect(dialog.locator('[data-plan-price-preview]')).toHaveText(
    /^\$\s?70\.000(,00)? al mes · Presencial$/,
  )
  await expect(dialog).toContainText('Desde ese momento se ofrece en Allfit Space')
  await expect(dialog).toContainText('Un precio publicado no se edita nunca')
  await dialog.getByRole('button', { name: 'Crear y publicar' }).click()

  await expect(page).toHaveURL(new RegExp(`${BILLING_PATH}/plans/[0-9a-f-]+$`))
  await expect(page.getByLabel('Nombre')).toHaveValue('Dos veces por semana')
  await expect(page.locator('[data-plan-state]').first()).toHaveText('A la venta')
  await expect(page.locator('[data-plan-offer]')).toContainText(
    /\$\s?70\.000(,00)? al mes · Presencial/,
  )
  expect(writes(fixture, 'POST')[0]?.body).toEqual({ name: 'Dos veces por semana' })
  expect(publishes(fixture)[0]?.body).toEqual({
    amount_minor: 7000000,
    currency_code: 'COP',
    billing_period: 'month',
    delivery_mode: 'in_person',
  })
})

/*
 * Two commands cannot fail as one. If the price is refused the plan already
 * exists, so the dialog says so and offers both ways on, and asking again
 * never creates a second plan.
 */
test('a plan whose price is refused is kept as a draft, with both ways on', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.intercept = (request) =>
    request.method === 'POST' && request.path.endsWith('/versions')
      ? { status: 503, body: problem('upstream-unavailable', 503) }
      : undefined
  await installStudioApiMock(page, fixture)
  await page.goto(PLANS_TAB)

  await page.getByRole('button', { name: 'Nuevo plan' }).click()
  const dialog = createDialog(page)
  await dialog.getByLabel('Nombre').fill('Dos veces por semana')
  await dialog.getByLabel('Precio en pesos colombianos (COP)').fill('70000')
  await dialog.getByRole('button', { name: 'Crear y publicar' }).click()

  await expect(dialog).toContainText('El plan se creó, pero su precio no se publicó')
  await dialog.getByRole('button', { name: 'Publicar el precio' }).click()
  await expect(dialog).toContainText('El plan se creó, pero su precio no se publicó')
  expect(writes(fixture, 'POST')).toHaveLength(1)

  await dialog.getByRole('button', { name: 'Abrir el borrador' }).click()
  await expect(page).toHaveURL(new RegExp(`${BILLING_PATH}/plans/[0-9a-f-]+$`))
  await expect(page.locator('[data-plan-state]')).toHaveText('Borrador')
  expect(writes(fixture, 'POST')).toHaveLength(1)
})

test('the address the form used to have opens the dialog over the plans, once', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(NEW_PATH)

  await expect(createDialog(page)).toBeVisible()
  await expect(page).toHaveURL(PLANS_TAB)
  // The address no longer asks to create, so coming back does not open it again.
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Planes' })).toHaveAttribute('aria-selected', 'true')
  await expect(createDialog(page)).toHaveCount(0)
})

test('a name the organization uses, in any case, is refused on the name', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)
  const before = fixture.organizationPlans.length
  const dialog = createDialog(page)

  await dialog.getByLabel('Nombre').fill('mensual ILIMITADO')
  await dialog.getByRole('button', { name: 'Guardar sin precio' }).click()

  await expect(
    dialog.getByText('Ya hay un plan con ese nombre, aunque esté escrito con otras mayúsculas.'),
  ).toBeVisible()
  // Still on the dialog, with what was typed, and nothing was created.
  await expect(dialog.getByLabel('Nombre')).toHaveValue('mensual ILIMITADO')
  await expect(page).toHaveURL(PLANS_TAB)
  expect(fixture.organizationPlans).toHaveLength(before)
})

test('the name is asked for before anything is sent, and the price only to publish', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)
  const dialog = createDialog(page)

  await dialog.getByRole('button', { name: 'Guardar sin precio' }).click()
  await expect(dialog.getByText('Escribe el nombre del plan.')).toBeVisible()
  // Saving without a price asks for no price.
  await expect(dialog.getByText('Escribe el precio en pesos.')).toHaveCount(0)

  await dialog.getByLabel('Nombre').fill('Trimestral')
  await dialog.getByRole('button', { name: 'Crear y publicar' }).click()
  await expect(dialog.getByText('Escribe el precio en pesos.')).toBeVisible()
  expect(writes(fixture, 'POST')).toHaveLength(0)
})

test('a coach is told who creates plans, and Cobros offers none to create', async ({ page }) => {
  await installStudioApiMock(page, asCoach())
  await page.goto(BILLING_PATH)
  await expect(page.getByText('Mensual ilimitado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo plan' })).toHaveCount(0)
  await expect(page.getByText('Tu rol no crea planes')).toHaveCount(0)

  await page.goto(NEW_PATH)
  await expect(page.getByText('Tu rol no crea planes')).toBeVisible()
  await expect(createDialog(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Crear y publicar' })).toHaveCount(0)
})

test('a plan on sale is renamed on its own page', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(BILLING_PATH)
  await page.getByRole('tab', { name: 'Planes' }).click()
  await page.getByRole('link', { name: 'Mensual ilimitado' }).click()

  await expect(page).toHaveURL(MONTHLY_PATH)
  // Nothing to save until the name differs.
  await expect(page.getByRole('button', { name: 'Guardar el nombre' })).toHaveCount(0)
  await page.getByLabel('Nombre').fill('Mensual libre')
  await page.getByRole('button', { name: 'Guardar el nombre' }).click()

  await expect(page.getByText('Nombre guardado.')).toBeVisible()
  await expect(page.getByLabel('Nombre')).toHaveValue('Mensual libre')
  await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText('Mensual libre')
  expect(writes(fixture, 'PATCH')[0]?.body).toEqual({ name: 'Mensual libre' })
})

test('a rename to a name another plan has is refused on the name', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(MONTHLY_PATH)

  await page.getByLabel('Nombre').fill('remoto de verano')
  await page.getByRole('button', { name: 'Guardar el nombre' }).click()

  await expect(page.getByText(/Ya hay un plan con ese nombre/)).toBeVisible()
})

test('a coach reads a plan’s page without anything to change it', async ({ page }) => {
  await installStudioApiMock(page, asCoach())
  await page.goto(MONTHLY_PATH)

  await expect(page.locator('[data-plan-summary]')).toContainText('Versión 2')
  // The name is read, not typed, and neither action is offered.
  await expect(page.getByRole('heading', { name: 'Mensual ilimitado' })).toBeVisible()
  await expect(page.getByLabel('Nombre')).toHaveCount(0)
  await expect(page.locator('[data-plan-publish-action]')).toHaveCount(0)
  await expect(page.locator('[data-plan-menu]')).toHaveCount(0)
  await expect(
    page.getByText('Cambiar un plan corresponde a quienes administran los cobros.'),
  ).toBeVisible()
})

test('a plan that is not this organization’s reads as not found', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${BILLING_PATH}/plans/01991600-e000-7000-8000-000000000999`)

  await expect(page.getByText('No encontramos este plan')).toBeVisible()
})
