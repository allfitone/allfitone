import { expect, test } from '@playwright/test'

import {
  clientCard,
  clientExecutions,
  createStudioApiFixture,
  emptyExecutionDetail,
  enduranceExecutionDetail,
  holderMembership,
  installStudioApiMock,
} from './studio-api-mock'

/**
 * HU-STUDIO-055 — one session a client shares with her coach, in full.
 *
 * Most of the story is the operation's: it never carries heart rate, pain, body
 * weight or the capture device, so criteria 3, 5 and 6 cannot be broken from
 * here. What is checked is criterion 4, which can: a field she did not share is
 * indistinguishable from one she did not record, so the screen must never fill
 * an absence — not with an empty panel and not with a sentence.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const SESSION = clientExecutions[0]?.id ?? ''
const DETAIL = `/organizations/${ORG}/clients/people/${PERSON}/executions/${SESSION}`
const LIST = `/organizations/${ORG}/clients/people/${PERSON}/executions`

test.beforeEach(async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
})

/* The row that led nowhere until this story now opens the session. */
test('a row in her sessions opens the session', async ({ page }) => {
  await page.goto(LIST)

  await page.locator('[data-client-execution-open]').first().click()

  await expect(
    page.getByRole('heading', { level: 1, name: 'Resultado de la sesión' }),
  ).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${SESSION}$`))
})

test('shows what she recorded, by family and by block', async ({ page }) => {
  await page.goto(DETAIL)

  const panels = page.locator('[data-client-execution-results]')
  await expect(panels).toHaveCount(2)
  await expect(panels.nth(0)).toContainText('Series')
  await expect(panels.nth(1)).toContainText('Movilidad')

  // Each row says which block of the session it came from.
  await expect(panels.nth(0).locator('[data-client-execution-result-block]').first()).toHaveText(
    'Bloque 1 · Fuerza',
  )
  await expect(panels.nth(1).locator('[data-client-execution-result-block]').first()).toHaveText(
    'Bloque 2 · Movilidad',
  )
})

test('a set reads as reps, load and effort, as she typed them', async ({ page }) => {
  await page.goto(DETAIL)
  const sets = page.locator('[data-client-execution-results][data-family="strength"] li')

  await expect(sets.nth(0)).toContainText('1. Sentadilla trasera')
  await expect(sets.nth(0)).toContainText('8 repeticiones · 80 kg · RPE 8')
})

/*
 * Criterion 4 at the row level. The third set carries reps and nothing else:
 * the two absent parts are skipped, never replaced by a sentence claiming the
 * field exists and is empty.
 */
test('a part that did not arrive is skipped, never filled', async ({ page }) => {
  await page.goto(DETAIL)
  const third = page.locator('[data-client-execution-results][data-family="strength"] li').nth(2)

  await expect(third).toContainText('1 repetición')
  await expect(third).not.toContainText('sin registrar')
  await expect(third).not.toContainText('RPE')
  await expect(third).not.toContainText('—')
})

/* Both sides is the ordinary case, so naming it would bury the real one. */
test('a one-sided hold says which side, and a two-sided one says nothing', async ({ page }) => {
  await page.goto(DETAIL)
  const holds = page.locator('[data-client-execution-results][data-family="mobility"] li')

  await expect(holds.nth(0)).toContainText('lado derecho')
  await expect(holds.nth(1)).not.toContainText('lado')
})

/*
 * The rule the whole screen is shaped by: a session of running has no sets, and
 * an empty «Series» panel would say she recorded none.
 */
test('a family the session recorded nothing in is drawn nowhere', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientExecutionDetail: enduranceExecutionDetail,
    }),
  )
  await page.goto(DETAIL)

  /*
   * Asserted on the panels and not on the page's text: the summary explains
   * that series and loads are what it shows, so a page-wide search for
   * «Series» matches that sentence and would pass for the wrong reason.
   */
  const panels = page.locator('[data-client-execution-results]')
  await expect(panels).toHaveCount(1)
  await expect(panels.locator('[data-slot="card-title"]')).toHaveText(['Vueltas'])
  await expect(page.locator('[data-client-execution-results][data-family="strength"]')).toHaveCount(
    0,
  )
})

/* «Vuelta» reads as going around something, so the panel says what it holds. */
test('the laps panel says what a lap is, and the other families do not', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientExecutionDetail: enduranceExecutionDetail,
    }),
  )
  await page.goto(DETAIL)

  await expect(page.locator('[data-client-execution-family-note]')).toHaveText(
    'Cada vuelta es un trozo del esfuerzo, con la distancia y el tiempo que ella registró.',
  )

  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
  await page.goto(DETAIL)
  await expect(page.locator('[data-client-execution-family-note]')).toHaveCount(0)
})

test('a lap nothing timed keeps its distance and claims no time', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientExecutionDetail: enduranceExecutionDetail,
    }),
  )
  await page.goto(DETAIL)
  const laps = page.locator('[data-client-execution-results] li')

  await expect(laps.nth(0)).toContainText('1 km · 4 min 18 s')
  await expect(laps.nth(2)).toHaveText(/Vuelta 3\s*1 km/)
})

/* Said once, instead of five empty panels. */
test('a session with nothing saved says so once, and does not blame her', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientExecutionDetail: emptyExecutionDetail,
    }),
  )
  await page.goto(DETAIL)

  await expect(page.locator('[data-client-execution-nothing-recorded]')).toContainText(
    'No hay resultados guardados en esta sesión',
  )
  await expect(page.locator('[data-client-execution-results]')).toHaveCount(0)
  // Criterion 4: it says the two readings cannot be told apart from here.
  await expect(page.getByText('no se puede saber si no registró nada')).toBeVisible()
})

test('the notes on the session read oldest first, and say who wrote them', async ({ page }) => {
  await page.goto(DETAIL)
  const notes = page.locator('[data-client-execution-observation]')

  await expect(notes).toHaveCount(2)
  await expect(notes.nth(0)).toContainText('Diana Entrante')
  await expect(notes.nth(0)).toContainText('Mantuvo la profundidad')
  // The reader sees «tú» on their own, and a corrected one says so.
  await expect(notes.nth(1)).toContainText('Tú')
  await expect(notes.nth(1)).toContainText('Corregida después de escribirse')
})

/* What the answer never carries, said once so nobody looks for it. */
test('says where pain and body weight are read, instead of leaving gaps', async ({ page }) => {
  await page.goto(DETAIL)
  const summary = page.locator('[data-client-execution-summary]')

  await expect(summary).toContainText('se leen por sus propias categorías')
  await expect(summary).toContainText('frecuencia cardiaca')
  /*
   * What must be absent is a *field* for them, not the words: the sentence
   * above names both to say where they are read instead. So the assertion is
   * on the labels of the facts list, which is where a field would appear.
   */
  const labels = page.locator('[data-client-execution-facts] dt')
  await expect(labels.filter({ hasText: 'Dolor' })).toHaveCount(0)
  await expect(labels.filter({ hasText: 'Peso' })).toHaveCount(0)
})

test('says which grant showed the session', async ({ page }) => {
  await page.goto(DETAIL)

  await expect(page.locator('[data-client-execution-scope]')).toContainText(
    'relationship_training, versión 4',
  )
})

/*
 * The one `404` that stands for six reasons. It names none of them, because
 * picking one would be a guess about her.
 */
test('a session the coach may not open names none of the six reasons', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      executionDetailOutcome: 'not-found',
    }),
  )
  await page.goto(DETAIL)

  const empty = page.locator('[data-client-execution-unreachable]')
  await expect(empty).toContainText('No encontramos esta sesión')
  await expect(empty).toContainText('no se puede distinguir, y no vamos a suponerlo')
  await expect(page.getByRole('link', { name: 'Volver a sus sesiones' })).toBeVisible()
})

test('sharing neither category is a refusal, not an empty session', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      executionDetailOutcome: 'scope-required',
    }),
  )
  await page.goto(DETAIL)

  await expect(page.locator('[data-client-execution-scope-required]')).toContainText(
    'No te autorizó su entrenamiento',
  )
  await expect(page.getByRole('link', { name: 'Ver su ficha' })).toBeVisible()
  await expect(page.locator('[data-client-execution-results]')).toHaveCount(0)
})

/*
 * Every read of her data is recorded and shown to her, so the window regaining
 * focus must not write her one nobody asked for.
 */
test('it reads the session once and never on its own', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/studio/v1/') && path.endsWith(`/executions/${SESSION}`)) {
      asked.push(path)
    }
  })

  await page.goto(DETAIL)
  await expect(page.locator('[data-client-execution-summary]')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(300)

  expect(asked).toHaveLength(1)
})
