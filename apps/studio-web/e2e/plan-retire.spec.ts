import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  draftPlan,
  error,
  installStudioApiMock,
  MONTHLY_PLAN_ID,
  planOffSale,
  planOnSale,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-076: taking a price off sale. The dialog says both criteria before
 * the click: nobody new subscribes (1), and nobody already subscribed is
 * cancelled, suspended or moved (2). A plan has one price on sale, so that is
 * the version the page offers to retire, and because it cannot be undone it
 * waits in the plan's menu rather than beside the button that publishes.
 */

const PLANS_PATH = `/organizations/${activeMembership.organization_id}/billing/plans`
const MONTHLY_PATH = `${PLANS_PATH}/${MONTHLY_PLAN_ID}`
const ON_SALE_VERSION_ID = planOnSale.current_version.plan_version_id

function deprecations(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/deprecation'),
  )
}

async function openOwner(page: Page, path: string) {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(path)
  await expect(page.locator('[data-plan-summary]')).toBeVisible()
  return fixture
}

async function askToRetire(page: Page) {
  await page.getByRole('button', { name: 'Más acciones de Mensual ilimitado' }).click()
  await page.getByRole('menuitem', { name: 'Retirar el precio' }).click()
  return page.getByRole('alertdialog')
}

test('retiring the price on sale says both halves first, and leaves the plan off sale', async ({
  page,
}) => {
  const fixture = await openOwner(page, MONTHLY_PATH)

  const dialog = await askToRetire(page)
  await expect(dialog).toContainText(
    /¿Retirar la versión 2: \$\s?120\.000(,00)? al mes · presencial\?/,
  )
  await expect(dialog).toContainText('Nadie más podrá suscribirse a este precio.')
  await expect(dialog).toContainText('no se cancela, no se suspende y no cambia de plan a nadie')
  await dialog.getByRole('button', { name: 'Retirar ahora' }).click()

  await expect(
    page.getByText('Retirado: el plan queda fuera de venta hasta que publiques otro precio.'),
  ).toBeVisible()
  await expect(page.locator('[data-plan-offer]')).toHaveAttribute('data-plan-offer', 'off_sale')
  await expect(page.locator('[data-plan-state]')).toHaveText('Fuera de venta')
  const prices = page.locator('[data-studio-register="plan-prices"]')
  await expect(prices.locator('tbody tr')).toHaveCount(2)
  await expect(prices.getByText('A la venta')).toHaveCount(0)
  // Off sale, the plan is sold again by publishing a price, and has none left to retire.
  await expect(page.getByRole('button', { name: 'Publicar un precio' })).toBeVisible()
  await expect(page.locator('[data-plan-menu]')).toHaveCount(0)
  expect(deprecations(fixture).map((request) => request.path)).toEqual([
    `/studio/v1/organizations/${activeMembership.organization_id}/plans/${MONTHLY_PLAN_ID}/versions/${ON_SALE_VERSION_ID}/deprecation`,
  ])
})

test('keeping it on sale sends nothing', async ({ page }) => {
  const fixture = await openOwner(page, MONTHLY_PATH)

  const dialog = await askToRetire(page)
  await dialog.getByRole('button', { name: 'Mantenerlo a la venta' }).click()

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.locator('[data-plan-offer]')).toHaveAttribute('data-plan-offer', 'on_sale')
  expect(deprecations(fixture)).toHaveLength(0)
})

test('a plan off sale has nothing to retire, and neither has a draft', async ({ page }) => {
  await openOwner(page, `${PLANS_PATH}/${planOffSale.plan_id}`)
  await expect(page.getByText('No tiene ningún precio a la venta ahora.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publicar un precio' })).toBeVisible()
  await expect(page.locator('[data-plan-menu]')).toHaveCount(0)

  await page.goto(`${PLANS_PATH}/${draftPlan.plan_id}`)
  await expect(page.getByRole('button', { name: 'Publicar un precio' })).toBeVisible()
  await expect(page.locator('[data-plan-menu]')).toHaveCount(0)
})

test('a newer price published a moment earlier stays on sale, and the page says so', async ({
  page,
}) => {
  const fixture = await openOwner(page, MONTHLY_PATH)
  const newer = { ...planOnSale.current_version, plan_version_id: 'v3', version_number: 3 }
  fixture.intercept = (request) =>
    request.method === 'POST' && request.path.endsWith('/deprecation')
      ? { status: 200, body: { ...planOnSale, current_version: newer } }
      : undefined

  const dialog = await askToRetire(page)
  await dialog.getByRole('button', { name: 'Retirar ahora' }).click()

  await expect(
    page.getByText('Ese precio ya se había reemplazado por la versión 3, que sigue a la venta.'),
  ).toBeVisible()
})

test('a refusal is said in the dialog, and the price stays on sale', async ({ page }) => {
  const fixture = await openOwner(page, MONTHLY_PATH)
  fixture.intercept = (request) =>
    request.method === 'POST' && request.path.endsWith('/deprecation')
      ? { status: 403, body: error('forbidden') }
      : undefined

  const dialog = await askToRetire(page)
  await dialog.getByRole('button', { name: 'Retirar ahora' }).click()

  await expect(dialog).toContainText('No se retiró')
  await expect(dialog).toContainText('propietario y administración')
  await expect(page.locator('[data-plan-offer]')).toHaveAttribute('data-plan-offer', 'on_sale')
})

test('a coach reads the prices without the way to retire one', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [{ ...activeMembership, roles: ['coach'] }] }),
  )
  await page.goto(MONTHLY_PATH)

  await expect(page.locator('[data-studio-register="plan-prices"] tbody tr')).toHaveCount(2)
  await expect(page.locator('[data-plan-menu]')).toHaveCount(0)
})
