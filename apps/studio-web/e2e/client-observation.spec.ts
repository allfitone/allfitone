import { expect, test } from '@playwright/test'

import {
  clientCard,
  clientExecutions,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
} from './studio-api-mock'

/**
 * HU-STUDIO-057 — leaving a professional observation on a session.
 *
 * The story turns on two things a screen can get wrong. **Two categories with
 * two different grants:** holding her training at the writing level says
 * nothing about whether pain may be written down, which is health context with
 * its own permission. And **a transcription stays hers:** choosing "she told me"
 * records the coach as who captured it, not as its author, and that has to be
 * said where it is chosen.
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

/** Her card without one category at all, as if she never shared it. */
function cardWithout(scope: string) {
  return {
    ...clientCard,
    sections: clientCard.sections.filter((section) => section.scope_code !== scope),
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

test('offers both categories when she shared training and health to write', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientCard: cardWith({ relationship_training: 'contribute', health_context: 'contribute' }),
    }),
  )

  const kinds = page.locator('[data-client-observation-kind-choice] button')
  await expect(kinds).toHaveCount(2)
  await expect(kinds.nth(0)).toHaveText('Cómo entrenó')
  await expect(kinds.nth(1)).toHaveText('Dolor o limitación')
})

/*
 * The heart of the story. Her training at the writing level says nothing about
 * pain, so the health category is simply not offered — and the note under the
 * one that is offered says what it covers.
 */
test('offers only training when health was shared to read', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientCard: cardWith({ relationship_training: 'contribute', health_context: 'read' }),
    }),
  )

  await expect(page.locator('[data-client-observation-kind-choice]')).toHaveCount(0)
  await expect(page.locator('[data-client-observation-kind-note]')).toContainText(
    'Tu lectura de cómo entrenó',
  )
  await expect(page.getByText('Dolor o limitación')).toHaveCount(0)
})

/*
 * Absent, not disabled. Drawing it as unavailable would say she shared it,
 * which is a different fact about her than never having shared it.
 */
test('does not mention health at all when she never shared it', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientCard: cardWithout('health_context'),
    }),
  )

  await expect(page.locator('[data-client-observation-form]')).toBeVisible()
  await expect(page.getByText('Dolor o limitación')).toHaveCount(0)
})

test('says what a transcription does, where it is chosen', async ({ page }) => {
  await open(page)

  const note = page.locator('[data-client-observation-provenance-note]')
  await expect(note).toContainText('Queda firmada por ti')

  await page.getByRole('button', { name: 'Me lo dijo ella' }).click()
  await expect(note).toContainText('el dato sigue siendo suyo')
  await expect(note).toContainText('quien lo capturó')
})

test('writes the observation and shows it beside the others', async ({ page }) => {
  await open(page)

  await expect(page.locator('[data-client-execution-observation]')).toHaveCount(2)
  await page.getByLabel('Tu observación').fill('Bajó la cadera antes de lo que debía.')
  await page.getByRole('button', { name: 'Guardar observación' }).click()

  await expect(page.locator('[data-client-observation-outcome]')).toHaveText(
    'Quedó tu observación sobre cómo entrenó.',
  )
  // Written where it is read from, so the re-read shows it: three now, not two.
  await expect(page.locator('[data-client-execution-observation]')).toHaveCount(3)
  await expect(page.locator('[data-client-execution-observations]')).toContainText(
    'Bajó la cadera antes de lo que debía.',
  )
  // And the box is empty again, ready for another.
  await expect(page.getByLabel('Tu observación')).toHaveValue('')
})

test('a transcription says whose the content stays, once it is written', async ({ page }) => {
  await open(page)

  await page.getByRole('button', { name: 'Me lo dijo ella' }).click()
  await page.getByLabel('Tu observación').fill('Dice que el hombro le molestó al empujar.')
  await page.getByRole('button', { name: 'Guardar observación' }).click()

  await expect(page.locator('[data-client-observation-outcome]')).toHaveText(
    'Quedó transcrito lo que ella dijo. El dato sigue siendo suyo.',
  )
})

test('refuses an empty observation before asking, and says so once', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [holderMembership] })
  await open(page, fixture)

  await expect(page.locator('[data-client-observation-problem]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Guardar observación' }).click()

  await expect(page.locator('[data-client-observation-problem]')).toContainText(
    'Escribe tu observación antes de guardarla',
  )
  expect(fixture.requests.some((request) => request.method === 'POST')).toBe(false)
})

/*
 * She can withdraw the level between the read that drew the form and the click,
 * so the refusal is handled even though the form decided first — and it names
 * the category, because that is the one she would have to raise.
 */
test('a refusal names the category whose level is gone', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      observationOutcome: 'scope-required',
    }),
  )

  await page.getByLabel('Tu observación').fill('Bajó la cadera antes de lo que debía.')
  await page.getByRole('button', { name: 'Guardar observación' }).click()

  await expect(page.locator('[data-client-observation-failure]')).toContainText(
    'ya no tienes su entrenamiento en nivel de registro',
  )
  await expect(page.locator('[data-client-observation-failure]')).toContainText('Ella decide')
})

test('a paused service says where it is resolved, which is not here', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      observationOutcome: 'service-paused',
    }),
  )

  await page.getByLabel('Tu observación').fill('Bajó la cadera antes de lo que debía.')
  await page.getByRole('button', { name: 'Guardar observación' }).click()

  const failure = page.locator('[data-client-observation-failure]')
  await expect(failure).toContainText('reactivándolo o terminando el vínculo')
  await expect(failure).toContainText('no observación por observación')
})

/*
 * She shared her training only to read. The form is not drawn at all, and the
 * reason is said because the level is hers to raise.
 */
test('is not offered when she shared her training only to read', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientCard: cardWith({ relationship_training: 'read', health_context: 'read' }),
    }),
  )

  await expect(page.locator('[data-client-observation-form]')).toHaveCount(0)
  await expect(page.locator('[data-client-observation-read-only]')).toContainText(
    'solo para leerlo',
  )
})
