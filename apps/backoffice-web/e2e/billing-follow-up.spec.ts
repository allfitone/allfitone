import { expect, test } from '@playwright/test'

import {
  activeSession,
  attentionPanelRecord,
  billingFollowUpItem,
  createBackofficeFixture,
  mockBackofficeApi,
} from './backoffice-api-mock'

/**
 * `HU-BO-005` c1 and c5, `HU-BO-020` c3 — the attention panel's billing count leads to
 * who it is. The list names payers under a case when one is given (optional, ADR-046).
 */

const CASE = 'CASE-2026-FU'

function reads(fixture: ReturnType<typeof createBackofficeFixture>) {
  return fixture.requests.filter(
    (request) => request.path === '/backoffice/v1/support/billing-follow-up',
  )
}

test('the billing notice leads to who it counts', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      attention: { panel: attentionPanelRecord() },
    }),
  )

  await page.goto('/panel')
  await page.getByRole('link', { name: 'Ver a quién hacer seguimiento' }).click()

  await expect(page).toHaveURL('/people/billing')
  await expect(page.locator('[data-billing-follow-up-list]')).toBeVisible()
})

test('the list opens without a case, and under one each row opens the payments under it', async ({
  context,
  page,
}) => {
  const suspended = billingFollowUpItem()
  const failed = billingFollowUpItem({
    person_id: '019b4000-0000-7000-8000-000000000013',
    subscription_status: 'active',
    suspended_at: null,
    failed_charges: 1,
    last_failed_charge: {
      occurred_at: new Date().toISOString(),
      failure_code: 'billing_retry',
      amount_minor: 1990000,
      currency_code: 'COP',
    },
  })
  const fixture = createBackofficeFixture({
    session: activeSession(),
    billingFollowUp: { items: [suspended, failed] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto('/people/billing')
  await expect(page.locator('[data-billing-follow-up-summary]')).toHaveText(
    '2 personas por seguir.',
  )
  await expect(
    page.locator('[data-billing-follow-up-row]').first().locator('[data-billing-follow-up-person]'),
  ).toHaveAttribute('href', `/people/${suspended.person_id}`)

  await page.locator('#billing-case').fill('sin caso')
  await page.getByRole('button', { name: 'Ver la lista' }).click()
  await expect(page.getByText('La referencia del caso va como CASE-2026-001')).toBeVisible()

  await page.locator('#billing-case').fill(CASE)
  await page.getByRole('button', { name: 'Ver la lista' }).click()

  await expect(page).toHaveURL(`/people/billing?case_reference=${CASE}`)
  await expect(page.locator('[data-billing-follow-up-summary]')).toHaveText(
    '2 personas por seguir.',
  )
  const rows = page.locator('[data-billing-follow-up-row]')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toHaveAttribute('data-status', 'suspended')
  await expect(rows.first()).toContainText('Suspendida desde')
  await expect(rows.nth(1)).toContainText('1 cobro fallido en 30 días')
  await expect(rows.first().locator('[data-billing-follow-up-person]')).toHaveAttribute(
    'href',
    `/people/${suspended.person_id}?case_reference=${CASE}`,
  )
  // StrictMode may read the first page twice; the read under the case is the last one.
  const queries = reads(fixture).map((request) => request.query)
  expect(queries.at(-1)).toBe(`?case_reference=${CASE}&limit=50`)
  expect(queries.slice(0, -1).every((query) => query === '?limit=50')).toBe(true)
})

test('without the billing duty the screen names the duty it needs', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      billingFollowUp: { items: [], refusal: { status: 403, code: 'forbidden' } },
    }),
  )

  await page.goto(`/people/billing?case_reference=${CASE}`)

  await expect(page.getByText('view_billing_metadata').first()).toBeVisible()
})
