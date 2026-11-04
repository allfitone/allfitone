import { expect, test } from '@playwright/test'

import {
  activeSession,
  createBackofficeFixture,
  mockBackofficeApi,
  type LegalHoldFixture,
} from './backoffice-api-mock'

// HU-BO-033: the holds an officer answers for, applied before anyone asks to delete. They
// are the erasure screen's second section: same duty, and the menu is full.
const PATH = '/erasure-requests'
const SUBJECT = '019ac000-0000-7000-8000-000000000005'

function day(offset: number): string {
  return new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString()
}

function hold(overrides: Partial<LegalHoldFixture> = {}): LegalHoldFixture {
  return {
    id: '019ae000-0000-7000-8000-000000000701',
    subject_person_id: SUBJECT,
    data_classification_codes: ['body', 'nutrition'],
    scope_description: 'Mediciones y comidas del expediente 2026-301',
    reason_code: 'judicial_order',
    case_reference: 'JUZGADO-2026-301',
    valid_from: day(-10),
    valid_to: day(40),
    status: 'active',
    applied_by_person_id: '019ae000-0000-7000-8000-000000000003',
    released_at: null,
    released_by_person_id: null,
    lapsed_at: null,
    suspended_items: 2,
    items: 2,
    ...overrides,
  }
}

test('lists the holds in force, the one ending soonest first, with its last week marked', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      legalHolds: [
        hold(),
        hold({
          id: '019ae000-0000-7000-8000-000000000702',
          reason_code: 'regulatory_request',
          case_reference: 'SIC-2026-9',
          data_classification_codes: ['health'],
          valid_to: day(3),
          suspended_items: 0,
          items: 0,
        }),
      ],
    }),
  )
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(PATH)

  await expect(page.locator('[data-legal-holds-summary]')).toContainText(
    '2 retenciones vigentes, 1 vence esta semana',
  )
  const rows = page.locator('[data-legal-hold-row]')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('SIC-2026-9')
  await expect(rows.nth(0)).toContainText('Vence en 3 días')
  await expect(rows.nth(0)).toContainText('Ningún borrado detenido todavía')
  await expect(rows.nth(1)).toContainText('Cuerpo · Nutrición')
  await expect(rows.nth(1)).toContainText('orden judicial')
  await expect(rows.nth(1)).toContainText('2 borrados detenidos')
})

test('reads the ended holds only when asked, and says how each one ended', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    legalHolds: [
      hold({
        status: 'released',
        released_at: day(-1),
        released_by_person_id: '019ae000-0000-7000-8000-000000000007',
        suspended_items: 0,
      }),
      hold({
        id: '019ae000-0000-7000-8000-000000000703',
        status: 'lapsed',
        valid_to: day(-2),
        lapsed_at: day(-2),
        suspended_items: 0,
      }),
    ],
  })
  await mockBackofficeApi(context, fixture)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(PATH)

  await expect(page.locator('[data-legal-holds-empty]')).toContainText(
    'No hay retenciones vigentes',
  )
  await page.getByRole('button', { name: 'Terminadas' }).click()

  const rows = page.locator('[data-legal-hold-row]')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Liberada el')
  await expect(rows.nth(1)).toContainText('Venció el')
  await expect(rows.getByRole('button', { name: 'Liberar' })).toHaveCount(0)
  const reads = fixture.requests.filter(
    (request) => request.method === 'GET' && request.path === '/backoffice/v1/legal-holds',
  )
  expect(reads.at(-1)?.query).toContain('status=ended')
})

test('applies a hold over a person before anyone asks to delete anything', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ session: activeSession(), legalHolds: [] })
  await mockBackofficeApi(context, fixture)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(PATH)

  await page.getByRole('button', { name: 'Nueva retención' }).click()
  const form = page.locator('[data-legal-hold-form]')
  await expect(form).toContainText('No da acceso a nada')
  await expect(form).toContainText('No existen suspensiones indefinidas')

  const apply = form.getByRole('button', { name: 'Aplicar retención' })
  await apply.click()
  await expect(form).toContainText('Pega el identificador de la persona')
  await form.getByLabel('Persona').fill('Valentina Ríos')
  await apply.click()
  await expect(form).toContainText('Pega el identificador de la persona')

  await form.getByLabel('Persona').fill(SUBJECT)
  await apply.click()
  await expect(form).toContainText('Marca al menos un tipo de dato')

  await form.getByRole('checkbox', { name: 'Cuerpo' }).check()
  await form.getByRole('checkbox', { name: 'Nutrición' }).check()
  await form.getByLabel('Alcance').fill('Mediciones y comidas del expediente 2026-301')
  await form.getByLabel('Referencia del requerimiento').fill('JUZGADO-2026-301')
  await form.getByLabel('Vigente hasta').fill(day(90).slice(0, 10))
  expect(
    fixture.requests.filter(
      (request) => request.method === 'POST' && request.path === '/backoffice/v1/legal-holds',
    ),
  ).toHaveLength(0)
  await apply.click()

  await expect(page.locator('[data-legal-hold-row]')).toHaveCount(1)
  const sent = fixture.requests.filter(
    (request) => request.method === 'POST' && request.path === '/backoffice/v1/legal-holds',
  )
  expect(sent).toHaveLength(1)
  expect(sent[0]?.body).toMatchObject({
    subject_person_id: SUBJECT,
    data_classification_codes: ['body', 'nutrition'],
    reason_code: 'judicial_order',
    case_reference: 'JUZGADO-2026-301',
  })
  await expect(page.locator('[data-legal-hold-row]')).toContainText('Cuerpo · Nutrición')
  await expect(form).toHaveCount(0)
})

test('says what releasing does before it does it: the deletion follows its course', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ session: activeSession(), legalHolds: [hold()] })
  await mockBackofficeApi(context, fixture)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(PATH)

  await page.locator('[data-legal-hold-row]').getByRole('button', { name: 'Liberar' }).click()
  const confirm = page.locator('[data-legal-hold-release-confirm]')
  await expect(confirm).toContainText('la eliminación sigue su curso')
  await expect(confirm).toContainText('otra retención vigente')
  expect(fixture.requests.filter((request) => request.path.includes('/release'))).toHaveLength(0)

  await confirm.getByRole('button', { name: 'Confirmar liberación' }).click()

  await expect(page.locator('[data-legal-holds-empty]')).toContainText(
    'No hay retenciones vigentes',
  )
  expect(fixture.requests.filter((request) => request.path.includes('/release'))).toHaveLength(1)
})

test('a refused read names the duty it needs, not a failure', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      legalHoldsRefusal: { status: 403, code: 'forbidden' },
    }),
  )
  await page.goto(PATH)

  await expect(page.locator('[data-legal-holds-failure]')).toContainText('manage_privacy_requests')
  await expect(page.locator('[data-legal-hold-row]')).toHaveCount(0)
})

test('the separation refusal says why this officer, and not the duty', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      legalHolds: [],
      erasureRequests: {
        requests: [],
        nextHoldRefusal: { status: 403, code: 'separation-of-duties' },
      },
    }),
  )
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(PATH)

  await page.getByRole('button', { name: 'Nueva retención' }).click()
  const form = page.locator('[data-legal-hold-form]')
  await form.getByLabel('Persona').fill(SUBJECT)
  await form.getByRole('checkbox', { name: 'Salud' }).check()
  await form.getByLabel('Alcance').fill('Contexto de salud del expediente 2026-400')
  await form.getByLabel('Referencia del requerimiento').fill('SIC-2026-400')
  await form.getByLabel('Vigente hasta').fill(day(30).slice(0, 10))
  await form.getByRole('button', { name: 'Aplicar retención' }).click()

  const failure = page.locator('[data-legal-holds-failure]')
  await expect(failure).toContainText('acceso excepcional')
  await expect(failure).not.toContainText('manage_privacy_requests')
})
