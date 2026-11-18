import { expect, test } from '@playwright/test'

import {
  clientCard,
  clientExecutionDetail,
  clientExecutions,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
} from './studio-api-mock'

/**
 * HU-STUDIO-058 — correcting an observation of one's own.
 *
 * The story turns on **whose it is**. A coach corrects what he wrote and
 * nothing else: another professional's observation, a value she declared and
 * anything a device captured are not his, so there is no control on them. And
 * **a correction keeps the old text with its reason** — which is why the reason
 * is a required field and not an afterthought.
 *
 * The default fixture is shaped for this: two observations on the session, one
 * written by another coach and one by the reader.
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

/** The session with the reader's own observation changed, the others as they are. */
function detailWithMine(changes: Record<string, unknown>) {
  return {
    ...clientExecutionDetail,
    observations: clientExecutionDetail.observations.map((note) =>
      note.authored_by_me ? { ...note, ...changes } : note,
    ),
  }
}

async function open(page: import('@playwright/test').Page, fixture?: unknown) {
  await installStudioApiMock(
    page,
    (fixture as ReturnType<typeof createStudioApiFixture>) ??
      createStudioApiFixture({ memberships: [holderMembership] }),
  )
  await page.goto(DETAIL)
  await expect(page.getByRole('heading', { name: 'Observaciones' })).toBeVisible()
}

/** Opens the correction dialog on the reader's own observation. */
async function correct(page: import('@playwright/test').Page) {
  await page.locator('[data-client-observation-correct]').click()
  await expect(page.locator('[data-client-observation-correction-dialog]')).toBeVisible()
}

/*
 * Criteria 1 and 2 as the screen states them: the control is on his row and
 * nowhere else. The session shows two observations and only one is his.
 */
test('is offered on his own observation and on no other', async ({ page }) => {
  await open(page)

  const notes = page.locator('[data-client-execution-observation]')
  await expect(notes).toHaveCount(2)
  await expect(notes.nth(0)).toContainText('Diana Entrante')
  await expect(notes.nth(0).locator('[data-client-observation-correct]')).toHaveCount(0)
  await expect(notes.nth(1).locator('[data-client-observation-correct]')).toBeVisible()
})

/*
 * Criterion 4, decided before asking: she took her training down to reading, so
 * nothing on this session is correctable any more — the same condition that
 * takes the form away.
 */
test('is not offered once her category is only readable', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientCard: cardWith({ relationship_training: 'read' }),
    }),
  )

  await expect(page.locator('[data-client-observation-correct]')).toHaveCount(0)
  await expect(page.locator('[data-client-observation-read-only]')).toBeVisible()
})

test('says what it keeps and what it cannot move', async ({ page }) => {
  await open(page)
  await correct(page)

  const note = page.locator('[data-client-observation-correction-note]')
  await expect(note).toContainText('texto anterior')
  await expect(note).toContainText('no cambian')
  // It opens on what the row says, so he corrects rather than rewrites.
  await expect(page.getByLabel('Tu observación corregida')).toHaveValue(
    'Le subí la carga para la próxima semana.',
  )
})

/* Criterion 4 of the story: her words stay hers, even when he fixes them. */
test('correcting a transcription does not make it his', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientExecutionDetail: detailWithMine({ provenance: 'person_declared' }),
    }),
  )
  await correct(page)

  await expect(page.getByRole('heading', { name: 'Corregir lo que transcribiste' })).toBeVisible()
  await expect(page.locator('[data-client-observation-correction-note]')).toContainText(
    'no te vuelve su autor',
  )
})

test('corrects it, and the session shows the new text', async ({ page }) => {
  await open(page)
  await correct(page)

  await page.getByLabel('Tu observación corregida').fill('Le subí la carga de 60 a 62,5 kg.')
  await page.getByLabel('Motivo del cambio').fill('No había anotado la carga exacta.')
  await page.getByRole('button', { name: 'Guardar la corrección' }).click()

  await expect(page.locator('[data-client-observation-correction-dialog]')).toHaveCount(0)
  await expect(page.locator('[data-client-observation-correction-outcome]')).toHaveText(
    'Quedó corregida. Se guardó el texto anterior con tu motivo.',
  )
  // Corrected where it is read from, so the re-read shows it in the list.
  const notes = page.locator('[data-client-execution-observation]')
  await expect(notes.nth(1)).toContainText('Le subí la carga de 60 a 62,5 kg.')
  await expect(notes.nth(1)).toContainText('Corregida después de escribirse')
})

test('refuses an empty correction and one that changed nothing, before asking', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [holderMembership] })
  await open(page, fixture)
  await correct(page)

  // Unchanged: the text it opened with is the text it would send.
  await page.getByLabel('Motivo del cambio').fill('Una razón cualquiera.')
  await page.getByRole('button', { name: 'Guardar la corrección' }).click()
  await expect(page.locator('[data-client-observation-correction-problem]')).toContainText(
    'No cambiaste el texto',
  )

  await page.getByLabel('Tu observación corregida').fill('   ')
  await page.getByRole('button', { name: 'Guardar la corrección' }).click()
  await expect(page.locator('[data-client-observation-correction-problem]')).toContainText(
    'Escribe el texto corregido',
  )

  expect(fixture.requests.some((request) => request.method === 'POST')).toBe(false)
})

/* Criterion 3: the history keeps what changed and why, so the why is required. */
test('refuses a correction with no reason, and says what the reason is for', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [holderMembership] })
  await open(page, fixture)
  await correct(page)

  await page.getByLabel('Tu observación corregida').fill('Le subí la carga de 60 a 62,5 kg.')
  await page.getByRole('button', { name: 'Guardar la corrección' }).click()

  await expect(page.locator('[data-client-observation-correction-reason-problem]')).toContainText(
    'Escribe por qué la estás corrigiendo',
  )
  expect(fixture.requests.some((request) => request.method === 'POST')).toBe(false)
})

/*
 * The 409 that is not a failure. Only its author corrects it, so the other
 * version is his own from somewhere else — and nothing he typed is thrown away.
 */
test('a correction that moved on shows what it says now and keeps what he typed', async ({
  page,
}) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], revisionOutcome: 'stale-draft' }),
  )
  await correct(page)

  await page.getByLabel('Tu observación corregida').fill('Le subí la carga de 60 a 62,5 kg.')
  await page.getByLabel('Motivo del cambio').fill('No había anotado la carga exacta.')
  await page.getByRole('button', { name: 'Guardar la corrección' }).click()

  const moved = page.locator('[data-client-observation-correction-moved]')
  await expect(moved).toContainText('La corregí desde el celular y quedó así.')
  await expect(moved).toContainText('corriges sobre ese texto')
  await expect(page.getByLabel('Tu observación corregida')).toHaveValue(
    'Le subí la carga de 60 a 62,5 kg.',
  )
  await expect(page.locator('[data-client-observation-correction-failure]')).toHaveCount(0)
})

test('a refusal names the category whose level is gone', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], revisionOutcome: 'scope-required' }),
  )
  await correct(page)

  await page.getByLabel('Tu observación corregida').fill('Le subí la carga de 60 a 62,5 kg.')
  await page.getByLabel('Motivo del cambio').fill('No había anotado la carga exacta.')
  await page.getByRole('button', { name: 'Guardar la corrección' }).click()

  await expect(page.locator('[data-client-observation-correction-failure]')).toContainText(
    'ya no tienes su entrenamiento en nivel de registro',
  )
})

/* One answer for «not yours» and «the relationship ended», as the contract gives it. */
test('one he can no longer correct says so without guessing why', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], revisionOutcome: 'not-found' }),
  )
  await correct(page)

  await page.getByLabel('Tu observación corregida').fill('Le subí la carga de 60 a 62,5 kg.')
  await page.getByLabel('Motivo del cambio').fill('No había anotado la carga exacta.')
  await page.getByRole('button', { name: 'Guardar la corrección' }).click()

  await expect(page.locator('[data-client-observation-correction-failure]')).toContainText(
    'el vínculo con ella terminó',
  )
})
