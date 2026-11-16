import { expect, test } from '@playwright/test'

import {
  activeSession,
  createBackofficeFixture,
  diagnosisCircuit,
  diagnosisOperation,
  mockBackofficeApi,
} from './backoffice-api-mock'

const PATH = '/diagnosis'

test('a tripped channel is said first, before any individual failure', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      diagnosis: {
        circuits: [diagnosisCircuit({ state: 'open', failure_count: 12 })],
        operations: [diagnosisOperation()],
      },
    }),
  )

  await page.goto(PATH)

  await expect(page.getByText('Un canal de entrega está caído')).toBeVisible()
  await expect(page.getByText(/causa más probable/)).toBeVisible()
})

test('a healthy platform says nothing rather than reassuring', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      diagnosis: { circuits: [diagnosisCircuit()], operations: [diagnosisOperation()] },
    }),
  )

  await page.goto(PATH)

  await expect(page.getByRole('heading', { name: 'Canales de entrega' })).toBeVisible()
  await expect(page.getByText('Un canal de entrega está caído')).toBeHidden()
})

test('a queue with nothing sent yet does not read as a wall of failures', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      diagnosis: {
        circuits: [],
        operations: [
          diagnosisOperation({ state: 'pending', attempt_count: 0, last_error_code: null }),
          diagnosisOperation({ state: 'dead_lettered', attempt_count: 7 }),
        ],
      },
    }),
  )

  await page.goto(PATH)

  await expect(page.getByRole('cell', { name: 'Sin enviar todavía' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Se rindió' })).toBeVisible()
})

test('shows the five things the story asks for and nothing that carries content', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      diagnosis: { circuits: [], operations: [diagnosisOperation()] },
    }),
  )

  await page.goto(PATH)

  await expect(page.getByRole('cell', { name: 'identity.invitation_issued.v1' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Reintentando' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'smtp_timeout' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '3', exact: true })).toBeVisible()
  // The column that would carry a payload does not exist on this screen.
  await expect(page.getByRole('columnheader', { name: 'Contenido' })).toBeHidden()
})

// HU-BO-031 c1 and c3: the identifiers were answered and never shown, nor searchable.
test('shows the identifiers of each operation and finds those of one subject', async ({
  context,
  page,
}) => {
  const subject = '019a7000-0000-7000-8000-000000000777'
  const fixture = createBackofficeFixture({
    session: activeSession(),
    diagnosis: {
      circuits: [],
      operations: [
        diagnosisOperation({ subject_kind: 'organization', subject_id: subject }),
        diagnosisOperation({ label: 'identity.account_recovery.v1' }),
      ],
    },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await expect(page.locator('[data-operation-subject]').first()).toHaveText(
    'organization 019a7000…',
  )
  await expect(page.locator('[data-operation-subject]').first()).toHaveAttribute('title', subject)

  await page.locator('#diagnosis-identifier').fill('019a7000')
  await page.getByRole('button', { name: 'Buscar sus operaciones' }).click()
  await expect(page.getByText('Escribe el identificador completo')).toBeVisible()

  await page.locator('#diagnosis-identifier').fill(subject)
  await page.getByRole('button', { name: 'Buscar sus operaciones' }).click()

  await expect(page.locator('[data-operation-ids]')).toHaveCount(1)
  const reads = fixture.requests.filter(
    (request) => request.path === '/backoffice/v1/support/operations',
  )
  expect(reads.some((request) => request.query.includes(`aggregate_id=${subject}`))).toBe(true)
  await page.getByRole('button', { name: 'Ver todas' }).click()
  await expect(page.locator('[data-operation-ids]')).toHaveCount(2)
})

// HU-BO-031 c2: what failed silently — a job, a stopped worker, a refused store notice.
test('says which job failed, which stopped running, and lists a refused store notice', async ({
  context,
  page,
}) => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      diagnosis: {
        circuits: [],
        operations: [
          diagnosisOperation({
            source: 'store_notification',
            subject_kind: null,
            subject_id: null,
            label: 'app_store',
            state: 'failed',
            attempt_count: 4,
            last_error_code: 'unverified',
          }),
        ],
        jobs: [
          {
            job_name: 'privacy_disposition',
            last_run_at: minutesAgo(1),
            last_outcome: 'failed',
            last_failure_at: minutesAgo(1),
            last_error_code: 'privacy_disposition_failed',
            failures_24h: 3,
          },
          {
            job_name: 'platform_duty_lapse',
            last_run_at: minutesAgo(45),
            last_outcome: 'succeeded',
            last_failure_at: null,
            last_error_code: null,
            failures_24h: 0,
          },
        ],
      },
    }),
  )

  await page.goto(PATH)

  await expect(page.locator('[data-diagnosis-job="privacy_disposition"]')).toContainText(
    'falló (privacy_disposition_failed). 3 fallos en 24 horas.',
  )
  await expect(page.locator('[data-diagnosis-job="platform_duty_lapse"]')).toContainText(
    'No corre desde hace 45 min',
  )
  await expect(page.locator('[data-diagnosis-silent-jobs]')).toContainText('Vencimiento de deberes')
  await expect(page.getByRole('cell', { name: 'Aviso de la tienda' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Falló' })).toBeVisible()
})

test('filters the feed by state without asking for a case reference', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    diagnosis: {
      circuits: [],
      operations: [
        diagnosisOperation({ state: 'retrying' }),
        diagnosisOperation({ state: 'dead_lettered' }),
      ],
    },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByRole('combobox', { name: 'Estado' }).click()
  await page.getByRole('option', { name: 'Se rindió' }).click()

  await expect(page.getByRole('cell', { name: 'Reintentando' })).toBeHidden()

  const reads = fixture.requests.filter(
    (request) => request.path === '/backoffice/v1/support/operations',
  )
  expect(reads.some((request) => request.query.includes('state=dead_lettered'))).toBe(true)
  // No subject means nothing to trace to a case, so no case reference travels.
  expect(reads.every((request) => !request.query.includes('case_reference'))).toBe(true)
})

test('reaches the rest of the feed instead of stopping at the first page', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      diagnosis: {
        circuits: [],
        operations: Array.from({ length: 5 }, (_, index) =>
          diagnosisOperation({ label: `event.number-${index}.v1` }),
        ),
        pageSize: 2,
      },
    }),
  )

  await page.goto(PATH)

  const rows = page.getByRole('row').filter({ hasText: 'event.number-' })
  await expect(rows).toHaveCount(2)

  const more = page.getByRole('button', { name: 'Ver más operaciones' })
  await more.click()
  await expect(rows).toHaveCount(4)

  await more.click()
  await expect(rows).toHaveCount(5)
  await expect(more).toBeHidden()
})

test('explains a refused read as an expired duty, not as a generic error', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      diagnosis: {
        circuits: [],
        operations: [],
        refusal: { status: 403, code: 'forbidden' },
      },
    }),
  )

  await page.goto(PATH)

  await expect(page.getByText(/llegan con el rol de administrador/)).toBeVisible()
})

test('sends an unauthenticated operator back to the access screen', async ({ context, page }) => {
  await mockBackofficeApi(context, createBackofficeFixture())

  await page.goto(PATH)

  await expect(page.getByRole('heading', { name: 'Identifica tu acceso.' })).toBeVisible()
})
