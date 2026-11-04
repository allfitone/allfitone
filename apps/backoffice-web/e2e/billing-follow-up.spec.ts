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
 * who it is, and that list names payers only under a case.
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
  await expect(page.locator('[data-billing-follow-up-idle]')).toContainText('Primero el caso')
})

test('nothing is read without a case, and with one each row opens the person’s payments', async ({
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
  await page.getByRole('button', { name: 'Ver la lista' }).click()
  await expect(page.getByText('Falta una referencia de caso válida')).toBeVisible()
  expect(reads(fixture)).toHaveLength(0)

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
  expect(reads(fixture).map((request) => request.query)).toEqual([
    `?case_reference=${CASE}&limit=50`,
  ])
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
