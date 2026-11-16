import { expect, test } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  MONTHLY_PLAN_ID,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-074: creating a plan, and renaming one. Criterion 1, a name before
 * a price, is the form asking for the name alone; criterion 2, a draft sold to
 * nobody, is said on the plan it lands on; criterion 3, no two plans with one
 * name, is the server's 409 said on the name field.
 */

const BILLING_PATH = `/organizations/${activeMembership.organization_id}/billing`
const NEW_PATH = `${BILLING_PATH}/plans/new`
const MONTHLY_PATH = `${BILLING_PATH}/plans/${MONTHLY_PLAN_ID}`

function writes(fixture: StudioApiFixture, method: 'POST' | 'PATCH') {
  return fixture.requests.filter(
    (request) => request.method === method && /\/plans(\/[^/]+)?$/.test(request.path),
  )
}

function asCoach() {
  return createStudioApiFixture({ memberships: [{ ...activeMembership, roles: ['coach'] }] })
}

test('an owner creates a plan from Cobros and lands on it, a draft nobody can buy', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(BILLING_PATH)

  await page.getByRole('link', { name: 'Nuevo plan' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Nuevo plan' })).toBeVisible()
  await page.getByLabel('Nombre').fill('  Trimestral  ')
  await page.getByRole('button', { name: 'Crear plan' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${BILLING_PATH}/plans/[0-9a-f-]+$`))
  const summary = page.locator('[data-plan-summary]')
  await expect(summary).toContainText('Trimestral')
  await expect(summary).toContainText(
    'Borrador: todavía no tiene precio, así que nadie puede suscribirse.',
  )
  expect(writes(fixture, 'POST')[0]?.body).toEqual({ name: 'Trimestral' })
})

test('a name the organization uses, in any case, is refused on the name', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)
  const before = fixture.organizationPlans.length

  await page.getByLabel('Nombre').fill('mensual ILIMITADO')
  await page.getByRole('button', { name: 'Crear plan' }).click()

  await expect(
    page.getByText('Ya hay un plan con ese nombre, aunque esté escrito con otras mayúsculas.'),
  ).toBeVisible()
  await expect(page).toHaveURL(NEW_PATH)
  expect(fixture.organizationPlans).toHaveLength(before)
})

test('the name is asked for before anything is sent', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)

  await page.getByRole('button', { name: 'Crear plan' }).click()

  await expect(page.getByText('Escribe el nombre del plan.')).toBeVisible()
  expect(writes(fixture, 'POST')).toHaveLength(0)
})

test('a coach is told who creates plans, and Cobros offers none to create', async ({ page }) => {
  await installStudioApiMock(page, asCoach())
  await page.goto(BILLING_PATH)
  await expect(page.getByText('Mensual ilimitado')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nuevo plan' })).toHaveCount(0)

  await page.goto(NEW_PATH)
  await expect(page.getByText('Tu rol no crea planes')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear plan' })).toHaveCount(0)
})

test('a plan on sale is renamed on its own page', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(BILLING_PATH)
  await page.getByRole('tab', { name: 'Planes' }).click()
  await page.getByRole('link', { name: 'Abrir Mensual ilimitado' }).click()

  await expect(page).toHaveURL(MONTHLY_PATH)
  await page.getByLabel('Nombre').fill('Mensual libre')
  await page.getByRole('button', { name: 'Guardar el nombre' }).click()

  await expect(page.getByText('Nombre guardado.')).toBeVisible()
  await expect(page.locator('[data-plan-summary]')).toContainText('Mensual libre')
  expect(writes(fixture, 'PATCH')[0]?.body).toEqual({ name: 'Mensual libre' })
})

test('a rename to a name another plan has is refused on the name', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(MONTHLY_PATH)

  await page.getByLabel('Nombre').fill('remoto de verano')
  await page.getByRole('button', { name: 'Guardar el nombre' }).click()

  await expect(page.getByText(/Ya hay un plan con ese nombre/)).toBeVisible()
})

test('a coach reads a plan’s page without its forms', async ({ page }) => {
  await installStudioApiMock(page, asCoach())
  await page.goto(MONTHLY_PATH)

  await expect(page.locator('[data-plan-summary]')).toContainText('Versión 2')
  await expect(page.getByRole('button', { name: 'Guardar el nombre' })).toHaveCount(0)
  await expect(
    page.getByText('Cambiar un plan corresponde a quienes administran los cobros.'),
  ).toBeVisible()
})

test('a plan that is not this organization’s reads as not found', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${BILLING_PATH}/plans/01991600-e000-7000-8000-000000000999`)

  await expect(page.getByText('No encontramos este plan')).toBeVisible()
})
