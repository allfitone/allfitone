import { expect, test } from '@playwright/test'

import {
  SUBJECT_PERSON_ID,
  SUPPORT_SUBJECT_ID,
  accessEvent,
  activeSession,
  createBackofficeFixture,
  mockBackofficeApi,
} from './backoffice-api-mock'
import { typeInto } from './date-fields'

const PATH = '/access-log'

test('refuses an unfiltered query instead of paging the whole log', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    accessLog: { events: [accessEvent()] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText(/El registro completo no se navega/)).toBeVisible()
  // Reading the whole log is not auditing, so nothing is requested at all.
  expect(
    fixture.requests.filter((request) => request.path === '/backoffice/v1/access-events'),
  ).toHaveLength(0)
})

test('sends only the filters that were filled in', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    accessLog: { events: [accessEvent()] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUPPORT_SUBJECT_ID)
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText('1 acceso en total.')).toBeVisible()

  const read = fixture.requests.filter((request) => request.path === '/backoffice/v1/access-events')
  expect(read).toHaveLength(1)
  const query = new URLSearchParams(read[0]?.query)
  expect(query.get('subject_person_id')).toBe(SUPPORT_SUBJECT_ID)
  expect(query.get('actor_person_id')).toBeNull()
  expect(query.get('from')).toBeNull()
})

test("sends the period in the operator's local time; a bare end day covers the whole day", async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    accessLog: { events: [accessEvent()] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUPPORT_SUBJECT_ID)
  const from = page.getByRole('group', { name: 'Desde' })
  await typeInto(from.getByLabel('Fecha', { exact: true }), '03/11/2026')
  await from.getByRole('button', { name: 'Abrir horas' }).click()
  await page.getByRole('option', { name: '08:30' }).click()
  const to = page.getByRole('group', { name: 'Hasta' })
  await typeInto(to.getByLabel('Fecha', { exact: true }), '04/11/2026')

  await expect(from.getByLabel('Hora', { exact: true })).toHaveValue('08:30')
  await expect(to.getByLabel('Hora', { exact: true })).toHaveValue('23:59')
  await expect(from).toContainText('Formato: DD/MM/AAAA')
  await page.getByRole('button', { name: 'Consultar' }).click()
  await expect(page.getByText('1 acceso en total.')).toBeVisible()

  const read = fixture.requests.filter((request) => request.path === '/backoffice/v1/access-events')
  const query = new URLSearchParams(read[0]?.query)
  // The browser's own time zone decides the instant, as it did with datetime-local.
  const expected = await page.evaluate(() => [
    new Date(2026, 10, 3, 8, 30).toISOString(),
    new Date(2026, 10, 4, 23, 59).toISOString(),
  ])
  expect([query.get('from'), query.get('to')]).toEqual(expected)
})

test('a long answer is read to the end, a page at a time', async ({ context, page }) => {
  // HU-BO-030: the log stopped at fifty and said «en total», so an auditor answered from
  // the first page believing it was everything.
  const events = Array.from({ length: 55 }, (_, n) =>
    accessEvent({ occurred_at: new Date(Date.now() - (n + 1) * 60_000).toISOString() }),
  )
  const fixture = createBackofficeFixture({
    session: activeSession(),
    accessLog: { events },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUPPORT_SUBJECT_ID)
  await page.getByRole('button', { name: 'Consultar' }).click()

  const answer = page.locator('[data-access-log-answer]')
  await expect(answer).toContainText('Van 50 accesos, los más recientes')
  await expect(answer).toContainText('Hay más accesos que cumplen estos filtros')
  await expect(page.locator('[data-access-log-entry]')).toHaveCount(50)

  await page.getByRole('button', { name: 'Ver más accesos' }).click()

  await expect(page.locator('[data-access-log-entry]')).toHaveCount(55)
  await expect(answer).toContainText('55 accesos en total.')
  await expect(page.getByRole('button', { name: 'Ver más accesos' })).toHaveCount(0)

  const reads = fixture.requests.filter(
    (request) => request.path === '/backoffice/v1/access-events',
  )
  expect(reads).toHaveLength(2)
  const next = new URLSearchParams(reads[1]?.query)
  // The next page asks the same question it was asked first, from where it stopped.
  expect(next.get('subject_person_id')).toBe(SUPPORT_SUBJECT_ID)
  expect(next.get('cursor')).not.toBeNull()
})

test('refuses a malformed identifier before it becomes a query', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    accessLog: { events: [accessEvent()] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill('esa persona')
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText(/no tiene la forma de un id/)).toBeVisible()
  expect(
    fixture.requests.filter((request) => request.path === '/backoffice/v1/access-events'),
  ).toHaveLength(0)
})

test('says who accessed, what, about whom and when', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      accessLog: {
        events: [
          accessEvent({
            resource: 'nutrition.intake_entries',
            access_mode: 'live',
            scope_code: 'nutrition_intake',
            scope_version: 2,
          }),
        ],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUPPORT_SUBJECT_ID)
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByRole('heading', { name: 'nutrition.intake_entries' })).toBeVisible()
  await expect(page.getByText(SUBJECT_PERSON_ID)).toBeVisible()
  await expect(page.getByText('nutrition_intake · v2')).toBeVisible()
  // The record, never the content — and the screen says so rather than leaving an
  // auditor hunting for a detail view that should not exist.
  await expect(page.getByText(/nunca lo que se leyó/)).toBeVisible()
})

test('an exceptional access is set apart and carries its basis', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      accessLog: {
        events: [
          accessEvent({ access_mode: 'break_glass', resource: 'execution.executed_sessions' }),
          accessEvent({ access_mode: 'organization_operational' }),
        ],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUPPORT_SUBJECT_ID)
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.locator('[data-access-log-entry][data-exceptional="true"]')).toHaveCount(1)
  await expect(page.locator('[data-access-log-entry][data-exceptional="false"]')).toHaveCount(1)
  await expect(page.getByText(/No había permiso\. Se abrió una ventana excepcional/)).toBeVisible()
  await expect(page.getByText(/no una lectura de datos de salud/)).toBeVisible()
})

test('an incomplete answer says so, alongside what it does show', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      accessLog: {
        events: [
          accessEvent(),
          accessEvent({ access_mode: 'break_glass', withheld_from_viewer: true }),
        ],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUPPORT_SUBJECT_ID)
  await page.getByRole('button', { name: 'Consultar' }).click()

  const answer = page.locator('[data-access-log-answer]')
  await expect(answer.getByText('Esta respuesta está incompleta')).toBeVisible()
  await expect(answer.getByText(/1 acceso más que no te corresponde auditar/)).toBeVisible()
  await expect(answer.getByText(/pásale el caso a otra persona/)).toBeVisible()
  // Only the one it may audit is on screen.
  await expect(page.locator('[data-access-log-entry]')).toHaveCount(1)
})

test('an empty answer with withheld records never reads as "nobody looked"', async ({
  context,
  page,
}) => {
  // The failure the count exists to prevent: the auditor requested the only window
  // that touched this person, and the list comes back empty.
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      accessLog: {
        events: [accessEvent({ access_mode: 'break_glass', withheld_from_viewer: true })],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUPPORT_SUBJECT_ID)
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText('Esta respuesta está incompleta')).toBeVisible()
  await expect(page.getByText(/Esta consulta no responde la pregunta/)).toBeVisible()
  await expect(page.getByText(/No hay ningún acceso registrado/)).toHaveCount(0)
  await expect(page.locator('[data-access-log-entry]')).toHaveCount(0)
})

test('a genuinely empty answer says nothing was found', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), accessLog: { events: [] } }),
  )

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUPPORT_SUBJECT_ID)
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText(/No hay ningún acceso registrado/)).toBeVisible()
  await expect(page.getByText('Esta respuesta está incompleta')).toHaveCount(0)
})

test('narrows by team member as well as by affected person', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    accessLog: {
      events: [
        accessEvent(),
        accessEvent({ actor_person_id: '019a4000-0000-7000-8000-000000000009' }),
      ],
    },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByLabel('Integrante del equipo').fill(SUBJECT_PERSON_ID)
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText('1 acceso en total.')).toBeVisible()
  await expect(page.locator('[data-access-log-entry]')).toHaveCount(1)
})

test('a withdrawn audit duty is explained as expiry by design', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      accessLog: { refusal: { status: 403, code: 'forbidden' }, events: [] },
    }),
  )

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUPPORT_SUBJECT_ID)
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText('Esta pantalla pide un deber vigente')).toBeVisible()
  await expect(page.getByText(/Los deberes vencen por diseño/)).toBeVisible()
})

test("a read by Allfit staff is never presented as the person's permission", async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      accessLog: {
        events: [
          accessEvent({
            access_mode: 'support_metadata',
            resource: 'identity.professional_credentials',
            purpose: 'professional_credential_verification',
          }),
        ],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUPPORT_SUBJECT_ID)
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText('Lectura del equipo de Allfit')).toBeVisible()
  await expect(page.getByText(/No hubo permiso de la persona/)).toBeVisible()
  await expect(page.getByText(/tenía un permiso vigente/)).toHaveCount(0)
})
