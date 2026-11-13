import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  proposableVersion,
  secondActiveMembership,
} from './studio-api-mock'

/*
 * Criteria 2, 6 and 7 of HU-023, which arrived after this screen shipped.
 *
 * The acting persona matters more here than on any other screen: only `coach`
 * holds `assign_programs` in the published catalogue, so the owner the rest of
 * this suite invites with sees no program at all. Both are audited, because the
 * capability split is invisible on either path alone.
 */

/** A coach: holds `invite_clients` and `assign_programs`. */
const COACH_PATH = `/organizations/${secondActiveMembership.organization_id}/clients/invitations/new`
/** An owner: holds `invite_clients` and not `assign_programs`. */
const OWNER_PATH = `/organizations/${activeMembership.organization_id}/clients/invitations/new`

/** Comfortably in the future, so the test never depends on today's date. */
const START = '2030-06-01'

function asCoach() {
  return createStudioApiFixture({ memberships: [secondActiveMembership] })
}

function programSelect(page: Page) {
  return page.getByRole('combobox', { name: 'Programa' })
}

async function chooseTheProgram(page: Page) {
  await programSelect(page).click()
  await page.getByRole('option', { name: /Bloque de fuerza/ }).click()
}

function trainingBox(page: Page) {
  return page.getByRole('checkbox', { name: /Entrenamiento con nosotros/ })
}

test('an owner who may invite is offered no program at all', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(OWNER_PATH)

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Programa inicial')).toHaveCount(0)
  // And the list is never even read, because the capability decides it first.
  expect(fixture.requests.some((request) => request.path.endsWith('/programs'))).toBe(false)
})

test('a coach is offered the published versions, and only those', async ({ page }) => {
  await installStudioApiMock(page, asCoach())
  await page.goto(COACH_PATH)

  await programSelect(page).click()

  /*
   * Every published version of a live program, and nothing else: the
   * deprecated sibling of the first and the archived program's published
   * version are both absent. **Both absences name their program in full**, and
   * that is the point: a bare «Movilidad» matched the offerable «Movilidad
   * diaria» and a bare «v1» matched its version number, so each of the two
   * passed for the wrong reason until a second offerable program existed.
   */
  await expect(page.getByRole('option', { name: /Bloque de fuerza · v2/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /Movilidad diaria · v1/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /Bloque de fuerza · v1/ })).toHaveCount(0)
  await expect(page.getByRole('option', { name: /Movilidad para principiantes/ })).toHaveCount(0)
})

/*
 * The decision this screen exists to make legible: proposing a program is what
 * raises the permission, and the form says so where the choice is made and
 * shows the raised level on the row it belongs to.
 */
test('choosing a program ticks the training permission and says why', async ({ page }) => {
  await installStudioApiMock(page, asCoach())
  await page.goto(COACH_PATH)

  await expect(trainingBox(page)).not.toBeChecked()
  await chooseTheProgram(page)

  await expect(trainingBox(page)).toBeChecked()
  await expect(page.getByText(/pedirá permiso para registrar su entrenamiento/)).toBeVisible()
  await expect(page.getByText(/Ella lo decide por separado/)).toBeVisible()
  // The level, on the permission's own row rather than only in the program box.
  await expect(page.getByText('registrar', { exact: true })).toBeVisible()
})

/*
 * The link runs both ways, which is why no control has to be disabled: there is
 * no state where a program is proposed without the permission it needs.
 */
test('un-ticking the training permission drops the program', async ({ page }) => {
  await installStudioApiMock(page, asCoach())
  await page.goto(COACH_PATH)

  await chooseTheProgram(page)
  await expect(page.getByLabel('Empieza')).toBeVisible()

  await trainingBox(page).click()

  await expect(trainingBox(page)).not.toBeChecked()
  await expect(page.getByLabel('Empieza')).toHaveCount(0)
})

test('a start that already passed is refused before anything is sent', async ({ page }) => {
  const fixture = asCoach()
  await installStudioApiMock(page, fixture)
  await page.goto(COACH_PATH)

  await page.getByLabel('Correo electrónico').fill('ana@example.test')
  await chooseTheProgram(page)
  await page.getByLabel('Empieza').fill('2020-01-01')
  await page.getByRole('button', { name: 'Enviar invitación' }).click()

  await expect(page.getByText(/Esa fecha ya pasó/)).toBeVisible()
  expect(fixture.requests.some((request) => request.method === 'POST')).toBe(false)
})

test('a program with no date chosen is refused the same way', async ({ page }) => {
  const fixture = asCoach()
  await installStudioApiMock(page, fixture)
  await page.goto(COACH_PATH)

  await page.getByLabel('Correo electrónico').fill('ana@example.test')
  await chooseTheProgram(page)
  await page.getByRole('button', { name: 'Enviar invitación' }).click()

  await expect(page.getByText(/Un programa sin fecha no se puede proponer/)).toBeVisible()
  expect(fixture.requests.some((request) => request.method === 'POST')).toBe(false)
})

/*
 * What actually goes over the wire, which is where criteria 2, 6 and 7 live.
 * The database refuses two of the three fields, and refuses a program whose
 * training scope is not at `contribute` — and the API drops the field list from
 * those refusals, so getting the body right is the whole job.
 */
test('the invitation carries the three fields and the raised level', async ({ page }) => {
  const fixture = asCoach()
  await installStudioApiMock(page, fixture)
  await page.goto(COACH_PATH)

  await page.getByLabel('Correo electrónico').fill('ana@example.test')
  await chooseTheProgram(page)
  await page.getByLabel('Empieza').fill(START)
  await page.getByRole('button', { name: 'Enviar invitación' }).click()

  await expect(page.getByText('La invitación va en camino')).toBeVisible()

  const sent = fixture.requests.find(
    (request) => request.method === 'POST' && request.path.endsWith('/client-invitations'),
  )
  const body = sent?.body as {
    scopes: Array<{ scope_code: string; access_level: string }>
    program?: { program_version_id: string; starts_on: string; timezone: string }
  }
  expect(body.program?.program_version_id).toBe(proposableVersion.id)
  expect(body.program?.starts_on).toBe(START)
  // A zone, whatever this machine reports: two of the three fields is a refusal.
  expect(body.program?.timezone).toMatch(/^[A-Za-z]+\/[A-Za-z_/-]+$|^UTC$/)

  const training = body.scopes.find((scope) => scope.scope_code === 'relationship_training')
  expect(training?.access_level).toBe('contribute')
  // And nothing else was raised along with it.
  expect(body.scopes.filter((scope) => scope.scope_code !== 'relationship_training')).toEqual(
    expect.arrayContaining([]),
  )
  expect(
    body.scopes
      .filter((scope) => scope.scope_code !== 'relationship_training')
      .every((scope) => scope.access_level === 'read'),
  ).toBe(true)
})

// Criterion 7 from her side, on the confirmation: three separate yeses.
test('the confirmation names the three conditions the program needs', async ({ page }) => {
  await installStudioApiMock(page, asCoach())
  await page.goto(COACH_PATH)

  await page.getByLabel('Correo electrónico').fill('ana@example.test')
  await chooseTheProgram(page)
  await page.getByLabel('Empieza').fill(START)
  await page.getByRole('button', { name: 'Enviar invitación' }).click()

  await expect(page.getByText('Programa propuesto')).toBeVisible()
  await expect(page.getByText(/acepta la relación, acepta la propuesta y concede/)).toBeVisible()
})

/*
 * The one refusal the form cannot prevent: somebody retired the version while
 * it was open. The API gives a bare `422`, so the copy has to carry the whole
 * explanation and say the invitation did not go.
 */
test('a version retired mid-form is explained as a stale list', async ({ page }) => {
  const fixture = asCoach()
  fixture.programProposalOutcome = 'stale'
  await installStudioApiMock(page, fixture)
  await page.goto(COACH_PATH)

  await page.getByLabel('Correo electrónico').fill('ana@example.test')
  await chooseTheProgram(page)
  await page.getByLabel('Empieza').fill(START)
  await page.getByRole('button', { name: 'Enviar invitación' }).click()

  await expect(page.getByText(/haya retirado esa versión/)).toBeVisible()
  await expect(page.getByText(/La invitación no se envió/)).toBeVisible()
  await expect(page.getByText('La invitación va en camino')).toHaveCount(0)
})

test('a gym with nothing published says so instead of offering an empty picker', async ({
  page,
}) => {
  const fixture = asCoach()
  fixture.organizationPrograms = []
  await installStudioApiMock(page, fixture)
  await page.goto(COACH_PATH)

  await expect(page.getByText(/Todavía no hay ninguna versión de programa publicada/)).toBeVisible()
  await expect(programSelect(page)).toHaveCount(0)
})

/*
 * A program needs a permission the gym may not even be able to ask for: the
 * scope catalogue is curated in Backoffice. Offering the picker then would be
 * offering a dead end.
 */
test('no program is offered when the gym cannot ask for training', async ({ page }) => {
  const fixture = asCoach()
  fixture.offerableScopes = fixture.offerableScopes.filter(
    (scope) =>
      typeof scope === 'object' &&
      scope !== null &&
      'scope_code' in scope &&
      scope.scope_code !== 'relationship_training',
  )
  await installStudioApiMock(page, fixture)
  await page.goto(COACH_PATH)

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Programa inicial')).toHaveCount(0)
})
