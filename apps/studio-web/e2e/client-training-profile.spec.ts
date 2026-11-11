import { expect, test } from '@playwright/test'

import {
  clientCard,
  createStudioApiFixture,
  emptyTrainingProfile,
  holderMembership,
  installStudioApiMock,
  narrowTrainingProfile,
} from './studio-api-mock'

/**
 * HU-STUDIO-051 — the training profile a client shares with her coach.
 *
 * What is checked is the half the screen owns. The narrowing is the database's:
 * it reads only attributes classified as training, and it gates each column of a
 * claim on the version she accepted. So the screen's job is to say what arrived
 * and never to explain what did not.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const CARD = `/organizations/${ORG}/clients/people/${PERSON}`
const PROFILE = `${CARD}/profile`

test.beforeEach(async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
})

test('shows what she declared, in words rather than codes', async ({ page }) => {
  await page.goto(PROFILE)

  await expect(
    page.getByRole('heading', { level: 1, name: 'Perfil de entrenamiento' }),
  ).toBeVisible()
  await expect(page.getByText('Fuerza')).toBeVisible()
  // Said about her, not in her own voice: Space says «Ponerme en forma».
  await expect(page.getByText('Ponerse en forma')).toBeVisible()
  await expect(page.getByText('Glúteos')).toBeVisible()
  await expect(page.getByText('Piernas')).toBeVisible()
  await expect(page.getByText('Mujer')).toBeVisible()

  // A raw attribute or value code on screen is the defect this guards.
  await expect(page.getByText(/get_fit|some_practice|focus_areas|training_experience/)).toHaveCount(
    0,
  )
})

/*
 * Criterion 2, and the reason provenance is not decoration: two claims of one
 * attribute hold at once, and they disagree. Both are shown, each with where it
 * came from, because the server named no winner.
 */
test('shows every claim in force, with where each came from', async ({ page }) => {
  await page.goto(PROFILE)

  const experience = page
    .locator('[data-client-profile-group]')
    .filter({ hasText: 'Experiencia de entrenamiento' })

  await expect(experience).toContainText('Tiene experiencia')
  await expect(experience).toContainText('Lo observó un profesional')
  await expect(experience).toContainText('Tiene algo de práctica')
  await expect(experience).toContainText('Lo declaró ella')
  // The count says why two lines follow, before the reader asks which is right.
  await expect(experience).toContainText('2 vigentes')
})

/*
 * The count is of rows drawn, not of claims that arrived. Three emphasis zones
 * are in force and the version carries the value of two, so the badge says two
 * — anything else is a number the reader can see is wrong.
 */
test('counts the lines it drew, not the claims that arrived', async ({ page }) => {
  await page.goto(PROFILE)

  const zones = page.locator('[data-client-profile-group]').filter({ hasText: 'Zonas de énfasis' })
  await expect(zones.locator('[data-client-profile-claim]')).toHaveCount(2)
  await expect(zones).toContainText('2 vigentes')
  await expect(zones).not.toContainText('3 vigentes')
})

/*
 * Criterion 3. The function filters by data classification, so there is nothing
 * to hide here — which is exactly why a regression would be silent.
 */
test('carries nothing of her body or her health', async ({ page }) => {
  await page.goto(PROFILE)
  await expect(page.getByText('Fuerza')).toBeVisible()

  await expect(page.getByText(/Progreso corporal|Contexto de salud|Lo que comes/)).toHaveCount(0)
  await expect(page.getByText(/\bkg\b|lesi[oó]n|peso corporal/i)).toHaveCount(0)
})

/*
 * The column the version withheld. The screen may say the datum exists, because
 * its attribute code arrived; it may not say why the value is missing, because
 * «she never declared it» and «your version omits it» are the same answer.
 */
test('names a datum whose value did not travel, and does not blame her for it', async ({
  page,
}) => {
  await page.goto(PROFILE)

  const days = page
    .locator('[data-client-profile-group]')
    .filter({ hasText: 'Días de entrenamiento por semana' })

  await expect(days).toBeVisible()
  await expect(days).toContainText('no viaja con la versión del permiso que tienes')
  await expect(page.getByText(/Sin responder|No respondi/)).toHaveCount(0)
})

/*
 * Criterion 4, as two gyms would see it: an older version carries fewer fields
 * of the same person, and the screen says which version it is reading.
 */
test('says which version of the permission it is reading', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientTrainingProfile: narrowTrainingProfile,
    }),
  )
  await page.goto(PROFILE)

  await expect(page.getByText('Versión 1 del permiso de entrenamiento')).toBeVisible()
  await expect(page.getByText('otro gimnasio con otra versión puede ver otros')).toBeVisible()
  await expect(page.getByText('Ponerse en forma')).toBeVisible()
  // The origin was withheld too, and that is said rather than defaulted to her.
  await expect(page.getByText('Sin origen disponible')).toBeVisible()
  await expect(page.getByText('Lo declaró ella')).toHaveCount(0)
})

/*
 * Criterion 1. Without the permission in force the answer is a refusal, so the
 * screen is a refusal: nothing of hers, not even blank fields.
 */
test('without the training permission it shows nothing, and says what is missing', async ({
  page,
}) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientTrainingProfile: null }),
  )
  await page.goto(PROFILE)

  await expect(page.getByText('No te autorizó su entrenamiento')).toBeVisible()
  await expect(page.getByText('El intento queda registrado')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver su ficha' })).toBeVisible()
  await expect(page.locator('[data-client-profile-group]')).toHaveCount(0)
})

test('sharing the category and nothing in it is a state, not a failure', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientTrainingProfile: emptyTrainingProfile,
    }),
  )
  await page.goto(PROFILE)

  await expect(
    page.getByText('No hay nada de su entrenamiento que podamos mostrarte'),
  ).toBeVisible()
  // Both readings offered and neither chosen.
  await expect(page.getByText('todavía no haya declarado nada')).toBeVisible()
  await expect(page.getByText('no se puede distinguir')).toBeVisible()
})

test('a person the caller does not attend has no profile to open', async ({ page }) => {
  await installStudioApiMock(
    page,
    // The card is what says whether he attends her, so the profile answers 404
    // for the same reason and from the same fact.
    createStudioApiFixture({ memberships: [holderMembership], clientCard: null }),
  )
  await page.goto(PROFILE)

  await expect(page.getByText('No encontramos este perfil')).toBeVisible()
})

/*
 * Every answer here is a read recorded for her to see. Returning to the window
 * must not write her another one: what would be logged then is the window's
 * focus, not anybody asking.
 */
test('asks once on arrival and never again on its own', async ({ page }) => {
  // The API read, not the page navigation: both paths end in `/profile`.
  const reads: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/studio/v1/') && pathname.endsWith('/profile')) {
      reads.push(request.url())
    }
  })

  await page.goto(PROFILE)
  await expect(page.getByText('Fuerza')).toBeVisible()
  expect(reads).toHaveLength(1)

  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByText('Fuerza')).toBeVisible()
  expect(reads).toHaveLength(1)
})

/*
 * The card is the way in. Its training section is the only one with a door,
 * because it is the only one whose reads this app can serve yet.
 */
test('is opened from the training section of the card, and only from it', async ({ page }) => {
  await page.goto(CARD)
  await expect(page.getByRole('heading', { name: 'Entrenamiento con nosotros' })).toBeVisible()

  const doors = page.locator('[data-client-card-profile-link]')
  await expect(doors).toHaveCount(1)

  await doors.click()
  await expect(page).toHaveURL(new RegExp(`${PERSON}/profile$`))
  await expect(
    page.getByRole('heading', { level: 1, name: 'Perfil de entrenamiento' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Volver a su ficha' }).click()
  await expect(page).toHaveURL(new RegExp(`people/${PERSON}$`))
})
