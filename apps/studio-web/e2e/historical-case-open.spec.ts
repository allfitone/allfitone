import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  endedRelationshipHistory,
  formerHolderMembershipId,
  installStudioApiMock,
  terminatedClient,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-061: opening a case to read a relationship the organization ended.
 * Criterion 1 is said before anything is asked and holds for a coach, who opens
 * nothing; 2 and 3 are the five purposes and nothing else; 4 is a duration with no
 * default; 5 is the opener or the coach who held her at the end; 6 is the fresh
 * sign-in, which keeps the form across it.
 */

const CASES_PATH = `/organizations/${activeMembership.organization_id}/historical-access-cases`
const NEW_PATH = `${CASES_PATH}/new`

function asOwner(overrides: Partial<StudioApiFixture> = {}) {
  return createStudioApiFixture({
    memberships: [activeMembership],
    relationshipHistory: structuredClone(endedRelationshipHistory),
    ...overrides,
  })
}

function opens(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/historical-access-cases'),
  )
}

async function fillCase(page: Page, hours = '4 horas') {
  await page.getByRole('button', { name: 'Elegir a Bruno Bello' }).click()
  await page.getByRole('radio', { name: 'A ti' }).check()
  await page.getByRole('radio', { name: 'Disputa del servicio' }).check()
  await page.getByLabel('Referencia del caso').fill('  RAD-2026-114  ')
  await page.getByLabel('Justificación').fill('Reclamo formal por el cobro de octubre.')
  await page.getByLabel('Duración').click()
  await page.getByRole('option', { name: hours, exact: true }).click()
}

test('an owner opens a case over an ended relationship and finds it open', async ({ page }) => {
  const fixture = asOwner()
  await installStudioApiMock(page, fixture)
  await page.goto(CASES_PATH)

  await expect(page.getByRole('heading', { level: 1, name: 'Casos de historial' })).toBeVisible()
  await page.getByRole('link', { name: 'Abrir un caso' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Abrir un caso' })).toBeVisible()
  // Criterion 1, before the first question.
  await expect(page.getByText('Abrirlo no te deja leer nada por sí solo')).toBeVisible()

  await fillCase(page)
  await page.getByRole('button', { name: 'Abrir el caso' }).click()

  await expect(page).toHaveURL(CASES_PATH)
  const opened = page.locator('[data-historical-case]').first()
  await expect(opened).toContainText('Bruno Bello')
  await expect(opened).toContainText('Abierto')
  await expect(opened).toContainText('Disputa del servicio')
  await expect(opened).toContainText('Ada Lovelace (tú)')
  // The justification stays in the case, never in a list.
  await expect(page.getByText('Reclamo formal por el cobro de octubre.')).toHaveCount(0)
  expect(opens(fixture)[0]?.body).toEqual({
    relationship_id: terminatedClient.relationship_id,
    authorized_membership_id: activeMembership.membership_id,
    purpose: 'service_dispute',
    case_reference: 'RAD-2026-114',
    justification: 'Reclamo formal por el cobro de octubre.',
    duration_hours: 4,
  })
})

test('only ended relationships are offered, found by name', async ({ page }) => {
  const fixture = asOwner()
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)

  const picker = page.locator('[data-historical-case-picker-results]')
  await expect(picker.locator('li')).toHaveCount(1)
  await expect(picker).toContainText('Bruno Bello')
  await page.getByLabel('Buscar por nombre').fill('ana')
  await expect(page.getByText('Ninguna relación terminada coincide con ese nombre.')).toBeVisible()
  const searches = fixture.requests.filter((request) => request.path.endsWith('/clients'))
  expect(searches.every((request) => request.search?.includes('status=terminated'))).toBe(true)
})

test('criteria 2 and 3: the five purposes, and no invalid one even as an example', async ({
  page,
}) => {
  await installStudioApiMock(page, asOwner())
  await page.goto(NEW_PATH)

  const purposes = page.getByRole('radiogroup', { name: 'Propósito' }).getByRole('radio')
  await expect(purposes).toHaveCount(5)
  for (const name of [
    'Disputa del servicio',
    'Obligación legal o regulatoria',
    'Solicitud de soporte de la persona',
    'Investigación de seguridad',
    'Revisión de calidad autorizada',
  ]) {
    await expect(page.getByRole('radio', { name })).toBeVisible()
  }
  const form = page.locator('form[data-studio-form]')
  for (const invalid of [/marketing/i, /comercial/i, /inteligencia artificial/i, /curiosidad/i]) {
    await expect(form).not.toContainText(invalid)
  }
})

test('criterion 4: the duration is chosen, never defaulted', async ({ page }) => {
  const fixture = asOwner()
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)

  await expect(page.getByLabel('Duración')).toContainText('Elige cuántas horas')
  await page.getByRole('button', { name: 'Elegir a Bruno Bello' }).click()
  await page.getByRole('radio', { name: 'A ti' }).check()
  await page.getByRole('radio', { name: 'Investigación de seguridad' }).check()
  await page.getByLabel('Referencia del caso').fill('SEG-01')
  await page.getByLabel('Justificación').fill('Acceso indebido reportado.')
  await page.getByRole('button', { name: 'Abrir el caso' }).click()

  await expect(page.getByText('Elige cuántas horas dura el caso.')).toBeVisible()
  expect(opens(fixture)).toHaveLength(0)

  await page.getByLabel('Duración').click()
  await expect(page.getByRole('option')).toHaveCount(24)
  await expect(page.getByRole('option', { name: '1 hora', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '24 horas', exact: true })).toBeVisible()
})

test('criterion 5: the opener, or the coach who held her when it ended, and nobody else', async ({
  page,
}) => {
  const fixture = asOwner()
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)
  await page.getByRole('button', { name: 'Elegir a Bruno Bello' }).click()

  const choices = page.getByRole('radiogroup', { name: 'A quién autoriza' }).getByRole('radio')
  await expect(choices).toHaveCount(2)
  await expect(page.getByRole('radio', { name: 'Diana Entrante' })).toBeVisible()
  // Replaced before the end, so never hers to read.
  await expect(page.getByRole('radio', { name: 'Camilo Saliente' })).toHaveCount(0)
  await expect(page.getByText('Staff nunca.')).toBeVisible()

  await page.getByRole('radio', { name: 'Diana Entrante' }).check()
  await page.getByRole('radio', { name: 'Solicitud de soporte de la persona' }).check()
  await page.getByLabel('Referencia del caso').fill('SOP-7781')
  await page.getByLabel('Justificación').fill('Pide revisar sus sesiones de junio.')
  await page.getByLabel('Duración').click()
  await page.getByRole('option', { name: '2 horas', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir el caso' }).click()

  await expect(page).toHaveURL(CASES_PATH)
  await expect(page.locator('[data-historical-case]').first()).toContainText('Diana Entrante')
  expect(opens(fixture)[0]?.body).toMatchObject({
    authorized_membership_id: formerHolderMembershipId,
  })
})

test('criterion 5: a coach who no longer qualifies is refused in words', async ({ page }) => {
  await installStudioApiMock(page, asOwner({ historicalOpenOutcome: 'ineligible' }))
  await page.goto(NEW_PATH)
  await fillCase(page)
  await page.getByRole('button', { name: 'Abrir el caso' }).click()

  const refusal = page.locator('[data-historical-case-error]')
  await expect(refusal).toContainText('No se abrió el caso')
  await expect(refusal).toContainText('propietario, administración o coach')
})

test('a 409 names both causes, because the answer does not say which', async ({ page }) => {
  await installStudioApiMock(page, asOwner({ historicalOpenOutcome: 'conflict' }))
  await page.goto(NEW_PATH)
  await fillCase(page)
  await page.getByRole('button', { name: 'Abrir el caso' }).click()

  const refusal = page.locator('[data-historical-case-error]')
  await expect(refusal).toContainText('ningún permiso congelado')
  await expect(refusal).toContainText('ya hay un caso abierto')
})

test('criterion 6: an old sign-in sends her to sign in again and keeps what she wrote', async ({
  page,
}) => {
  const fixture = asOwner({ historicalOpenOutcome: 'reauthenticate' })
  fixture.intercept = (request) => {
    if (request.method !== 'GET' || request.path !== '/studio/v1/auth/start') return undefined
    // The provider takes the credentials again; the callback lands on the entry.
    fixture.historicalOpenOutcome = 'opened'
    return { status: 302, headers: { Location: new URL('/app', page.url()).toString() } }
  }
  await installStudioApiMock(page, fixture)
  await page.goto(NEW_PATH)
  await fillCase(page, '6 horas')
  await page.getByRole('button', { name: 'Abrir el caso' }).click()

  const ask = page.locator('[data-historical-case-reauthenticate]')
  await expect(ask).toContainText('Vuelve a iniciar sesión para abrir el caso')
  await ask.getByRole('button', { name: 'Iniciar sesión de nuevo' }).click()

  await expect(page).toHaveURL(NEW_PATH)
  expect(fixture.requests.find((request) => request.path === '/studio/v1/auth/start')?.search).toBe(
    '?reauthenticate=true',
  )
  await expect(page.locator('[data-historical-case-restored]')).toBeVisible()
  await expect(page.getByLabel('Referencia del caso')).toHaveValue('  RAD-2026-114  ')
  await expect(page.getByLabel('Duración')).toContainText('6 horas')

  await page.getByRole('button', { name: 'Abrir el caso' }).click()
  await expect(page).toHaveURL(CASES_PATH)
  expect(opens(fixture)).toHaveLength(2)
  expect(opens(fixture)[1]?.body).toMatchObject({ duration_hours: 6 })
})

test('criterion 1: a coach opens nothing, and is told who does', async ({ page }) => {
  const fixture = asOwner({ memberships: [{ ...activeMembership, roles: ['coach'] }] })
  await installStudioApiMock(page, fixture)

  await page.goto(CASES_PATH)
  await expect(page.getByText('No tienes casos')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Abrir un caso' })).toHaveCount(0)

  await page.goto(NEW_PATH)
  await expect(page.getByText('Tu rol no abre casos')).toBeVisible()
  await expect(page.getByLabel('Referencia del caso')).toHaveCount(0)
  expect(opens(fixture)).toHaveLength(0)
})
