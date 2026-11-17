import { expect, test, type Page } from '@playwright/test'

import {
  clientCard,
  clientExecutions,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
} from './studio-api-mock'

/**
 * HU-STUDIO-059 — proposing a correction to something she declared.
 *
 * The story turns on one sentence: **proposing changes nothing.** There is no
 * way from this screen to overwrite a value of hers, and the dialog says so
 * before the field, because the control a coach just pressed reads as if there
 * were. She decides in her own app, within thirty days, and her silence is not
 * a yes.
 *
 * The default session holds three strength sets: two she filled completely and
 * one where she wrote only the repetitions — which is what proves a field she
 * left empty is not offered.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const SESSION = clientExecutions[0]?.id ?? ''
const DETAIL = `/organizations/${ORG}/clients/people/${PERSON}/executions/${SESSION}`

/** Her card with one category's level changed, leaving the rest as it is. */
function cardWith(level: Record<string, 'read' | 'contribute'>) {
  return {
    ...clientCard,
    sections: clientCard.sections.map((section) =>
      level[section.scope_code] ? { ...section, access_level: level[section.scope_code] } : section,
    ),
  }
}

async function open(page: Page, fixture?: unknown) {
  await installStudioApiMock(
    page,
    (fixture as ReturnType<typeof createStudioApiFixture>) ??
      createStudioApiFixture({ memberships: [holderMembership] }),
  )
  await page.goto(DETAIL)
  await expect(page.getByRole('heading', { name: 'Series' })).toBeVisible()
}

/** Opens the proposal dialog on one set, counting from the first. */
async function propose(page: Page, index = 0) {
  await page.locator('[data-client-correction-propose]').nth(index).click()
  await expect(page.locator('[data-client-correction-dialog]')).toBeVisible()
}

/* Criterion 1, and it is the first thing the dialog says. */
test('says nothing of hers moves, before showing a field', async ({ page }) => {
  await open(page)
  await propose(page)

  const note = page.locator('[data-client-correction-note]')
  await expect(note).toContainText('no cambia nada de lo que ella registró')
  await expect(note).toContainText('ella decide en su app')
})

test('offers the three fields she filled, with her own value and her own unit', async ({
  page,
}) => {
  await open(page)
  await propose(page)

  const fields = page.locator('[data-client-correction-field-choice] button')
  await expect(fields).toHaveCount(3)
  await expect(fields.nth(0)).toHaveText('Repeticiones')
  await expect(fields.nth(1)).toHaveText('Carga')
  await expect(fields.nth(2)).toHaveText('RPE')

  // The first field is current, so the row's own value is what it says.
  await expect(page.locator('[data-client-correction-declared]')).toContainText('Ella registró 8')
  await page.getByRole('button', { name: 'Carga' }).click()
  await expect(page.locator('[data-client-correction-declared]')).toContainText(
    'Ella registró 80 kg',
  )
  // Her unit, so there is no unit to pick.
  await expect(page.getByLabel('Carga que propones (kg)')).toBeVisible()
})

/*
 * Criterion 2, the half a screen can decide: she wrote only the repetitions on
 * the third set, so there is nothing else to correct and no chooser at all.
 */
test('a field she left empty is not offered', async ({ page }) => {
  await open(page)
  await propose(page, 2)

  await expect(page.locator('[data-client-correction-field-choice]')).toHaveCount(0)
  await expect(page.getByLabel('Repeticiones que propones')).toBeVisible()
  await expect(page.getByText('Carga que propones')).toHaveCount(0)
})

/* Criteria 3 and 4: she is told, and the deadline comes with what it means. */
test('proposes it, and says she was told and when it expires', async ({ page }) => {
  await open(page)
  await propose(page)

  await page.getByRole('button', { name: 'Carga' }).click()
  await page.getByLabel('Carga que propones (kg)').fill('82,5')
  await page.getByLabel('Por qué se lo propones').fill('La barra pesaba 2,5 kg más de lo anotado.')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()

  await expect(page.locator('[data-client-correction-dialog]')).toHaveCount(0)
  const said = page.locator('[data-client-correction-outcome]').first()
  await expect(said).toContainText('ya le avisamos')
  await expect(said).toContainText('sigue igual hasta que ella acepte')
  await expect(said).toContainText('su silencio no es un sí')
})

/* Criterion 5: the same field is not offered twice. */
test('a field that already waits on her is not offered again', async ({ page }) => {
  await open(page)
  await propose(page)

  await page.getByLabel('Repeticiones que propones').fill('9')
  await page.getByLabel('Por qué se lo propones').fill('Conté nueve, no ocho.')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()
  await expect(page.locator('[data-client-correction-dialog]')).toHaveCount(0)

  await propose(page)
  const waiting = page.locator('[data-client-correction-waiting]')
  await expect(waiting).toContainText('esperando su respuesta')
  // And there is nothing to press: the form is not drawn for that field.
  await expect(page.getByRole('button', { name: 'Enviar la propuesta' })).toHaveCount(0)
  // The other two fields are still open to a proposal.
  await page.getByRole('button', { name: 'Carga' }).click()
  await expect(page.getByLabel('Carga que propones (kg)')).toBeVisible()
})

test('refuses what the operation would refuse, before asking', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [holderMembership] })
  await open(page, fixture)
  await propose(page)

  await page.getByLabel('Por qué se lo propones').fill('Un motivo cualquiera.')
  const value = page.getByLabel('Repeticiones que propones')
  const problem = page.locator('[data-client-correction-value-problem]')

  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()
  await expect(problem).toContainText('Escribe el valor')

  await value.fill('ocho')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()
  await expect(problem).toContainText('Escribe un número')

  await value.fill('8,5')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()
  await expect(problem).toContainText('número entero')

  await value.fill('1001')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()
  await expect(problem).toContainText('fuera de lo que el campo admite')

  // Her own value: nothing to correct, and the server refuses it too.
  await value.fill('8')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()
  await expect(problem).toContainText('ella ya registró')

  expect(fixture.requests.some((request) => request.method === 'POST')).toBe(false)
})

test('refuses a proposal with no reason, and says who reads it', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [holderMembership] })
  await open(page, fixture)
  await propose(page)

  await page.getByLabel('Repeticiones que propones').fill('9')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()

  await expect(page.locator('[data-client-correction-reason-problem]')).toContainText(
    'Ella lo lee con la propuesta',
  )
  expect(fixture.requests.some((request) => request.method === 'POST')).toBe(false)
})

/*
 * Two 403s that are not the same conversation: one is a level she decides, the
 * other a role the organization decides. Sending him to the wrong person is the
 * failure this distinction prevents.
 */
test('the refusal of her permission is not the refusal of his role', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], proposalOutcome: 'scope-required' }),
  )
  await propose(page)
  await page.getByLabel('Repeticiones que propones').fill('9')
  await page.getByLabel('Por qué se lo propones').fill('Conté nueve, no ocho.')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()
  await expect(page.locator('[data-client-correction-failure]')).toContainText(
    'Ella decide ese permiso',
  )

  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], proposalOutcome: 'forbidden' }),
  )
  await propose(page)
  await page.getByLabel('Repeticiones que propones').fill('9')
  await page.getByLabel('Por qué se lo propones').fill('Conté nueve, no ocho.')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()
  await expect(page.locator('[data-client-correction-failure]')).toContainText(
    'quien administra el equipo',
  )
})

/* One 409 for three facts: it names the two he can act on and claims neither. */
test('the conflict names a waiting proposal and no address, without picking one', async ({
  page,
}) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], proposalOutcome: 'conflict' }),
  )
  await propose(page)

  await page.getByLabel('Repeticiones que propones').fill('9')
  await page.getByLabel('Por qué se lo propones').fill('Conté nueve, no ocho.')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()

  const failure = page.locator('[data-client-correction-failure]')
  await expect(failure).toContainText('ya hay una propuesta esperando')
  await expect(failure).toContainText('no tenemos a dónde avisarle')
})

/*
 * The other half of criterion 2, which no screen can decide: the session answer
 * carries no capture source, so a value that is not hers is worded and not
 * prevented.
 */
test('a value that is not hers says so, since the screen could not know', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], proposalOutcome: 'not-declared' }),
  )
  await propose(page)

  await page.getByLabel('Repeticiones que propones').fill('9')
  await page.getByLabel('Por qué se lo propones').fill('Conté nueve, no ocho.')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()

  await expect(page.locator('[data-client-correction-failure]')).toContainText('no lo declaró ella')
})

test('is not offered when she shared her training only to read', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientCard: cardWith({ relationship_training: 'read' }),
    }),
  )

  await expect(page.locator('[data-client-correction-propose]')).toHaveCount(0)
})

/* A proposal points at a strength set and at nothing else the session holds. */
test('is offered on her sets and on no other family', async ({ page }) => {
  await open(page)

  const strength = page.locator('[data-client-execution-results][data-family="strength"]')
  await expect(strength.locator('[data-client-correction-propose]')).toHaveCount(3)
  const mobility = page.locator('[data-client-execution-results][data-family="mobility"]')
  await expect(mobility.locator('[data-client-correction-propose]')).toHaveCount(0)
})
