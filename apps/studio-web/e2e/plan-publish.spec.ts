import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  draftPlan,
  error,
  installStudioApiMock,
  MONTHLY_PLAN_ID,
  planOnSale,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-075: putting a price on sale. Criterion 1 is the form's four
 * questions; criteria 2 and 3 are said in the dialog before the click, along
 * with the price it retires; criterion 4 is the remote warning, because the
 * payment link a remote price needs (HU-STUDIO-088) does not exist yet.
 */

const PLANS_PATH = `/organizations/${activeMembership.organization_id}/billing/plans`
const MONTHLY_PATH = `${PLANS_PATH}/${MONTHLY_PLAN_ID}`
const DRAFT_PATH = `${PLANS_PATH}/${draftPlan.plan_id}`

function publishes(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/versions'),
  )
}

async function openOwner(page: Page, path: string) {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(path)
  await expect(page.getByRole('button', { name: 'Publicar este precio' })).toBeVisible()
  return fixture
}

test('a new price retires the one on sale, and the dialog says so first', async ({ page }) => {
  const fixture = await openOwner(page, MONTHLY_PATH)
  await expect(page.getByLabel('Precio en pesos colombianos (COP)')).toHaveValue('120000')

  await page.getByLabel('Precio en pesos colombianos (COP)').fill('130.000')
  await page.getByRole('button', { name: 'Publicar este precio' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(/¿Publicar \$\s?130\.000(,00)? al mes · presencial\?/)
  await expect(dialog).toContainText(/Se retira el precio que está a la venta ahora: \$\s?120\.000/)
  await expect(dialog).toContainText('Quien ya está suscrito conserva el precio que aceptó')
  await expect(dialog).toContainText('Un precio publicado no se edita nunca')
  await dialog.getByRole('button', { name: 'Publicar ahora' }).click()

  await expect(page.getByText('Publicado: la versión 3 está a la venta.')).toBeVisible()
  const prices = page.getByRole('list', { name: 'Precios' })
  await expect(prices.getByRole('listitem').first()).toContainText(/Versión 3 · \$\s?130\.000/)
  await expect(prices.getByRole('listitem').nth(1)).toContainText('Retirada')
  expect(publishes(fixture)[0]?.body).toEqual({
    amount_minor: 13000000,
    currency_code: 'COP',
    billing_period: 'month',
    delivery_mode: 'in_person',
  })
})

test('a draft’s first price puts it on sale in Space', async ({ page }) => {
  const fixture = await openOwner(page, DRAFT_PATH)
  await expect(page.getByRole('heading', { name: 'Publicar un precio' })).toBeVisible()

  await page.getByLabel('Precio en pesos colombianos (COP)').fill('1200000')
  await page.getByRole('radio', { name: 'Anual' }).click()
  await page.getByRole('button', { name: 'Publicar este precio' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Desde ese momento se ofrece en Allfit Space')
  await expect(dialog).not.toContainText('Se retira')
  await expect(dialog).not.toContainText('Quien ya está suscrito')
  await dialog.getByRole('button', { name: 'Publicar ahora' }).click()

  await expect(page.locator('[data-plan-summary]')).toContainText(
    /A la venta: \$\s?1\.200\.000(,00)? al año · presencial/,
  )
  expect(publishes(fixture)[0]?.body).toMatchObject({
    amount_minor: 120000000,
    billing_period: 'year',
  })
})

test('a remote price is warned as not chargeable yet, and backing out sends nothing', async ({
  page,
}) => {
  const fixture = await openOwner(page, DRAFT_PATH)
  await page.getByLabel('Precio en pesos colombianos (COP)').fill('90000')
  await page.getByRole('radio', { name: 'Remoto' }).click()
  await page.getByRole('button', { name: 'Publicar este precio' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('no se ofrece en Allfit Space')
  await expect(dialog).toContainText('Ese link todavía no está disponible')
  await dialog.getByRole('button', { name: 'Seguir editando' }).click()

  await expect(dialog).toHaveCount(0)
  expect(publishes(fixture)).toHaveLength(0)
})

test('the price already on sale is not offered for publishing again', async ({ page }) => {
  const fixture = await openOwner(page, MONTHLY_PATH)

  await page.getByRole('button', { name: 'Publicar este precio' }).click()

  await expect(page.getByText('Ese precio ya es el que está a la venta.')).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(publishes(fixture)).toHaveLength(0)
})

test('centavos are refused before the dialog', async ({ page }) => {
  const fixture = await openOwner(page, MONTHLY_PATH)

  await page.getByLabel('Precio en pesos colombianos (COP)').fill('120000,50')
  await page.getByRole('button', { name: 'Publicar este precio' }).click()

  await expect(page.getByText(/pesos enteros, sin centavos/)).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(publishes(fixture)).toHaveLength(0)
})

test('a price published by somebody else a moment earlier is said as a conflict', async ({
  page,
}) => {
  const fixture = await openOwner(page, MONTHLY_PATH)
  fixture.intercept = (request) =>
    request.method === 'POST' && request.path.endsWith('/versions')
      ? { status: 409, body: error('conflict') }
      : undefined

  await page.getByLabel('Precio en pesos colombianos (COP)').fill('130000')
  await page.getByRole('button', { name: 'Publicar este precio' }).click()
  await page.getByRole('button', { name: 'Publicar ahora' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('No se publicó')
  await expect(dialog).toContainText('al mismo tiempo')
})

test('a price that was already on sale by the time it landed says nothing changed', async ({
  page,
}) => {
  const fixture = await openOwner(page, MONTHLY_PATH)
  // Somebody published this same price between the read and the click: the server answers 200.
  fixture.intercept = (request) =>
    request.method === 'POST' && request.path.endsWith('/versions')
      ? { status: 200, body: planOnSale }
      : undefined

  await page.getByLabel('Precio en pesos colombianos (COP)').fill('130000')
  await page.getByRole('button', { name: 'Publicar este precio' }).click()
  await page.getByRole('button', { name: 'Publicar ahora' }).click()

  await expect(page.getByText('Ese precio ya estaba a la venta; no cambió nada.')).toBeVisible()
})

test('a coach reads the prices without the form to publish one', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [{ ...activeMembership, roles: ['coach'] }] }),
  )
  await page.goto(MONTHLY_PATH)

  await expect(page.getByRole('list', { name: 'Precios' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publicar este precio' })).toHaveCount(0)
})
