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
 * the version the page offers to retire.
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

test('retiring the price on sale says both halves first, and leaves the plan off sale', async ({
  page,
}) => {
  const fixture = await openOwner(page, MONTHLY_PATH)

  await page.getByRole('button', { name: 'Retirar este precio' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(
    /¿Retirar la versión 2: \$\s?120\.000(,00)? al mes · presencial\?/,
  )
  await expect(dialog).toContainText('Nadie más podrá suscribirse a este precio.')
  await expect(dialog).toContainText('no se cancela, no se suspende y no cambia de plan a nadie')
  await dialog.getByRole('button', { name: 'Retirar ahora' }).click()

  await expect(
    page.getByText('Retirado: el plan queda fuera de venta hasta que publiques otro precio.'),
  ).toBeVisible()
  await expect(page.locator('[data-plan-summary]')).toContainText('Fuera de venta')
  const prices = page.getByRole('list', { name: 'Precios' })
  await expect(prices.getByText('A la venta')).toHaveCount(0)
  // Off sale, the plan is sold again by publishing a price.
  await expect(page.getByRole('heading', { name: 'Publicar un precio' })).toBeVisible()
  expect(deprecations(fixture).map((request) => request.path)).toEqual([
    `/studio/v1/organizations/${activeMembership.organization_id}/plans/${MONTHLY_PLAN_ID}/versions/${ON_SALE_VERSION_ID}/deprecation`,
  ])
})

test('keeping it on sale sends nothing', async ({ page }) => {
  const fixture = await openOwner(page, MONTHLY_PATH)

  await page.getByRole('button', { name: 'Retirar este precio' }).click()
  await page.getByRole('button', { name: 'Mantenerlo a la venta' }).click()

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.locator('[data-plan-summary]')).toContainText('A la venta:')
  expect(deprecations(fixture)).toHaveLength(0)
})

test('a plan off sale has nothing to retire, and a draft has no card at all', async ({ page }) => {
  await openOwner(page, `${PLANS_PATH}/${planOffSale.plan_id}`)
  await expect(page.getByText('Ahora no tiene ningún precio a la venta.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retirar este precio' })).toHaveCount(0)

  await page.goto(`${PLANS_PATH}/${draftPlan.plan_id}`)
  await expect(page.getByRole('heading', { name: 'Publicar un precio' })).toBeVisible()
  await expect(page.locator('[data-plan-retire]')).toHaveCount(0)
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

  await page.getByRole('button', { name: 'Retirar este precio' }).click()
  await page.getByRole('button', { name: 'Retirar ahora' }).click()

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

  await page.getByRole('button', { name: 'Retirar este precio' }).click()
  await page.getByRole('button', { name: 'Retirar ahora' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('No se retiró')
  await expect(dialog).toContainText('propietario y administración')
})

test('a coach reads the prices without the card to retire one', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [{ ...activeMembership, roles: ['coach'] }] }),
  )
  await page.goto(MONTHLY_PATH)

  await expect(page.getByRole('list', { name: 'Precios' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retirar este precio' })).toHaveCount(0)
})
