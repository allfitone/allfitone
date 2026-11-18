import { expect, test, type Page } from '@playwright/test'

import {
  assignmentPrescription,
  clientCard,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
} from './studio-api-mock'

/**
 * HU-STUDIO-049 — adjusting the prescription for one person.
 *
 * The story turns on what an adjustment is **not**: it does not edit the
 * routine or the programme the gym published. So the screen draws the published
 * target and the adjustment in force side by side and never merges them —
 * showing only the adjusted value would leave no way to see that the gym's
 * routine did not move, which is the first criterion.
 *
 * And **what a step admits is its family's business**: a strength step takes
 * sets, reps, load and RPE; an endurance one never takes RPE.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const ASSIGNMENT = assignmentPrescription.assignment_id
const PRESCRIPTION = `/organizations/${ORG}/clients/people/${PERSON}/programs/${ASSIGNMENT}/prescription`

async function open(page: Page, fixture?: unknown) {
  await installStudioApiMock(
    page,
    (fixture as ReturnType<typeof createStudioApiFixture>) ??
      createStudioApiFixture({ memberships: [holderMembership] }),
  )
  await page.goto(PRESCRIPTION)
  await expect(page.getByRole('heading', { name: 'Prescripción', level: 1 })).toBeVisible()
}

/** The step whose load is already adjusted to 42,5 kg. */
const squat = (page: Page) =>
  page.locator('[data-client-prescription-step]').filter({ hasText: 'Sentadilla trasera' })

/* Criterion 1, drawn: the routine as published and the adjustment, both. */
test('shows what the routine asks and what was adjusted, without merging them', async ({
  page,
}) => {
  await open(page)

  const row = squat(page).locator('[data-client-prescription-target]').filter({ hasText: 'Carga' })
  await expect(row.locator('[data-client-prescription-published]')).toHaveText(
    'La rutina pide 40 kg',
  )
  await expect(row.locator('[data-client-prescription-in-force]')).toContainText('42.5 kg')
})

test('says once per step that the gym routine does not change', async ({ page }) => {
  await open(page)

  await expect(page.locator('[data-client-prescription-note]')).toContainText(
    'no cambia la rutina ni el programa del gimnasio',
  )
  await expect(page.locator('[data-client-prescription-note]')).toContainText(
    'solo para esta persona',
  )
})

/*
 * The second criterion of the story is the server's, but the screen must not
 * claim otherwise: nothing here says who adjusted it, because the answer does
 * not carry that and inventing it would be worse than silence.
 */
test('a step with adjustments is marked, and one without is not', async ({ page }) => {
  await open(page)

  await expect(squat(page).locator('[data-client-prescription-step-adjusted]')).toBeVisible()
  const rowing = page
    .locator('[data-client-prescription-step]')
    .filter({ hasText: 'Remo en trote' })
  await expect(rowing.locator('[data-client-prescription-step-adjusted]')).toHaveCount(0)
})

/* What a step admits is decided by its family, and the families differ. */
test('a strength step offers sets, reps, load and RPE; an endurance one never RPE', async ({
  page,
}) => {
  await open(page)

  await squat(page).getByRole('button', { name: 'Ajustar para ella' }).click()
  const kinds = page.locator('[data-client-prescription-kind-choice] button')
  await expect(kinds).toHaveText(['Series', 'Repeticiones', 'Carga', 'RPE', 'Nota'])
  await page.getByRole('button', { name: 'Dejarlo como está' }).click()

  const rowing = page
    .locator('[data-client-prescription-step]')
    .filter({ hasText: 'Remo en trote' })
  await rowing.getByRole('button', { name: 'Ajustar para ella' }).click()
  await expect(kinds).toHaveText(['Distancia', 'Duración', 'Nota'])
  await expect(kinds.filter({ hasText: 'RPE' })).toHaveCount(0)
})

/*
 * The server needs a unit for a load and the routine states it, so a step whose
 * routine left the unit unset cannot take that adjustment: not offered, rather
 * than offering a refusal.
 *
 * A **value** the routine left unset is a different thing and stays offered:
 * this step states no RPE and the coach may still set one for her, which is
 * what «adapt the targets for this person» means.
 */
test('a step without its unit drops that adjustment, and keeps the ones it can take', async ({
  page,
}) => {
  await open(page)

  const deadlift = page
    .locator('[data-client-prescription-step]')
    .filter({ hasText: 'Peso muerto rumano' })
  await expect(deadlift).toContainText('La rutina no lo fija')
  await deadlift.getByRole('button', { name: 'Ajustar para ella' }).click()
  const kinds = page.locator('[data-client-prescription-kind-choice] button')
  await expect(kinds).toHaveText(['Series', 'Repeticiones', 'RPE', 'Nota'])
  await expect(kinds.filter({ hasText: 'Carga' })).toHaveCount(0)
})

test('a mobility step adjusts the side, by name and not by code', async ({ page }) => {
  await open(page)

  const hip = page
    .locator('[data-client-prescription-step]')
    .filter({ hasText: 'Apertura de cadera' })
  await expect(hip).toContainText('La rutina pide Los dos')
  await hip.getByRole('button', { name: 'Ajustar para ella' }).click()
  await page.getByRole('button', { name: 'Lado', exact: true }).click()
  await expect(page.locator('[data-client-prescription-side-choice] button')).toHaveText([
    'Izquierdo',
    'Derecho',
    'Los dos',
    'No aplica',
  ])
})

test('adjusts a target, and the screen shows it in force', async ({ page }) => {
  await open(page)

  await squat(page).getByRole('button', { name: 'Ajustar para ella' }).click()
  await page.getByRole('button', { name: 'Carga', exact: true }).click()
  await page.getByLabel('Carga (kg)').fill('45')
  await page.getByRole('button', { name: 'Guardar el ajuste' }).click()

  await expect(page.locator('[data-client-prescription-dialog]')).toHaveCount(0)
  const row = squat(page).locator('[data-client-prescription-target]').filter({ hasText: 'Carga' })
  await expect(row.locator('[data-client-prescription-in-force]')).toContainText('45 kg')
  // And the published routine is still what it was: the first criterion.
  await expect(row.locator('[data-client-prescription-published]')).toHaveText(
    'La rutina pide 40 kg',
  )
})

test('refuses what the operation would refuse, before asking', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [holderMembership] })
  await open(page, fixture)

  await squat(page).getByRole('button', { name: 'Ajustar para ella' }).click()
  const problem = page.locator('[data-client-prescription-problem]')

  await page.getByRole('button', { name: 'Guardar el ajuste' }).click()
  await expect(problem).toContainText('Escribe el valor')

  // Series are a whole number above zero.
  await page.getByLabel('Series').fill('3,5')
  await page.getByRole('button', { name: 'Guardar el ajuste' }).click()
  await expect(problem).toContainText('número entero')

  await page.getByLabel('Series').fill('0')
  await page.getByRole('button', { name: 'Guardar el ajuste' }).click()
  await expect(problem).toContainText('fuera de lo que el objetivo admite')

  // And what is already in force is not sent again.
  await page.getByRole('button', { name: 'Carga', exact: true }).click()
  await page.getByLabel('Carga (kg)').fill('42,5')
  await page.getByRole('button', { name: 'Guardar el ajuste' }).click()
  await expect(problem).toContainText('ya tiene ajustado')

  expect(fixture.requests.some((request) => request.method === 'POST')).toBe(false)
})

/* Criterion 4, as it arrives: read yes, adjust no. */
test('a programme the gym no longer manages says so, and keeps what was adjusted', async ({
  page,
}) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], prescriptionOutcome: 'conflict' }),
  )

  await squat(page).getByRole('button', { name: 'Ajustar para ella' }).click()
  await page.getByLabel('Series').fill('5')
  await page.getByRole('button', { name: 'Guardar el ajuste' }).click()

  const failure = page.locator('[data-client-prescription-write-failure]')
  await expect(failure).toContainText('ya no administra este programa')
  await expect(failure).toContainText('sigue en pie')
})

test('the two 403 are different conversations', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      prescriptionOutcome: 'scope-required',
    }),
  )
  await squat(page).getByRole('button', { name: 'Ajustar para ella' }).click()
  await page.getByLabel('Series').fill('5')
  await page.getByRole('button', { name: 'Guardar el ajuste' }).click()
  await expect(page.locator('[data-client-prescription-write-failure]')).toContainText(
    'Ella decide ese permiso',
  )

  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], prescriptionOutcome: 'forbidden' }),
  )
  await squat(page).getByRole('button', { name: 'Ajustar para ella' }).click()
  await page.getByLabel('Series').fill('5')
  await page.getByRole('button', { name: 'Guardar el ajuste' }).click()
  await expect(page.locator('[data-client-prescription-write-failure]')).toContainText(
    'tu rol en esta organización',
  )
})

/* The read is refused when she stopped sharing, and the attempt is logged. */
test('a refused read says the attempt is recorded', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], assignmentPrescription: null }),
  )
  await page.goto(PRESCRIPTION)

  await expect(page.locator('[data-client-prescription-failure]')).toContainText(
    'no está disponible para ti',
  )
  await expect(page.getByRole('link', { name: 'Volver a sus programas' })).toBeVisible()
})

test('the programs screen leads here, and says what can be done', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
  await page.goto(`/organizations/${ORG}/clients/people/${PERSON}/programs`)

  const link = page.getByRole('link', { name: 'Ver y ajustar la prescripción' }).first()
  await expect(link).toBeVisible()
  await link.click()
  await expect(page.getByRole('heading', { name: 'Prescripción', level: 1 })).toBeVisible()
})
