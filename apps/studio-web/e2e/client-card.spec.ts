import { expect, test } from '@playwright/test'

import {
  activeMembership,
  clientCard,
  clientCardWithoutSections,
  coveredClientCard,
  createStudioApiFixture,
  formerClientCard,
  holderMembership,
  installStudioApiMock,
} from './studio-api-mock'

/**
 * HU-STUDIO-083 — the card of a person the caller attends.
 *
 * The card is a coach's screen, so every test here signs in as one. What is
 * checked is the half the screen owns: that it draws only the categories that
 * arrived, that it reads none of her data while doing it, and that losing her
 * is explained instead of leaving a blank.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const CARD = `/organizations/${ORG}/clients/people/${PERSON}`
const DIRECTORY = `/organizations/${ORG}/clients`

/* The four she never shared with this relationship, as the catalogue names them. */
const NEVER_SHARED = [
  'Tu historial de entrenamiento',
  'Lo que comes',
  'Fotos de tus comidas',
  'Objetivos nutricionales',
]

test('shows who she is, since when, and what she authorized', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
  await page.goto(CARD)

  // The shell owns the `h1`, and a route nobody registers there is titled
  // "Studio" — which renders fine and tells the reader the wrong thing.
  await expect(page.getByRole('heading', { level: 1, name: 'Ficha' })).toBeVisible()
  // Twice on the screen on purpose, the way the relationship screen does it:
  // the sentence that explains the view, and the subject above her facts.
  await expect(page.locator('[data-client-card-attendance]')).toContainText('Ana Álvarez')
  await expect(page.locator('[data-client-card-attendance]')).toContainText('A cargo')

  await expect(page.getByRole('heading', { name: 'Entrenamiento con nosotros' })).toBeVisible()
  await expect(page.getByText('Puedes leer y registrar')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Contexto de salud' })).toBeVisible()
  await expect(page.getByText('Solo puedes leer')).toBeVisible()
})

/*
 * Criterion 2, and the reason this screen cannot be built from the catalogue of
 * seven. A category she never shared must not appear at all — listing all seven
 * and marking four of them would tell a coach which ones she was asked for and
 * refused.
 */
test('what she never shared is absent, not empty and not locked', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
  await page.goto(CARD)
  await expect(page.getByRole('heading', { name: 'Contexto de salud' })).toBeVisible()

  for (const name of NEVER_SHARED) {
    await expect(page.getByText(name)).toHaveCount(0)
  }
  await expect(page.getByText(/bloquead/i)).toHaveCount(0)
  await expect(page.getByText(/sin autorizar/i)).toHaveCount(0)
})

/*
 * Criterion 3 read the other way round. Opening the card records no access, and
 * each operation it points to records its own — so a prefetch here would put an
 * entry in the log she reads for something the coach never opened. The card's
 * `reads` all live under `/clients/{personId}/…`, which is what this watches.
 */
test('reads nothing of hers: no section is fetched ahead of time', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.includes(`/clients/${PERSON}/`)) asked.push(url.pathname)
  })

  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
  await page.goto(CARD)
  await expect(page.getByRole('heading', { name: 'Entrenamiento con nosotros' })).toBeVisible()
  await expect(page.getByText('Lo que retiró')).toBeVisible()

  expect(asked).toEqual([])
})

/*
 * `HU-STUDIO-084`'s first criterion, for the one case this operation answers
 * while she is still a client: she took a category back. The date is there and
 * the reason is not, because the operation does not carry one.
 */
test('says what she took back, and when, without inventing why', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
  await page.goto(CARD)

  const withdrawn = page.locator('[data-client-card-withdrawn]')
  await expect(withdrawn).toContainText('Progreso corporal')
  await expect(withdrawn).toContainText('Retirada el')
  // It is not offered as something to read, which is the difference between
  // this panel and the one above it.
  await expect(withdrawn.getByText('Solo puedes leer')).toHaveCount(0)
})

/*
 * A cover ends on a day of the gym's calendar. Read as an instant it renders as
 * the evening before anywhere west of Greenwich, so a cover ending on the 12th
 * was shown ending on the 11th — Colombia included.
 */
test('a cover is told when it ends, on the day it ends', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: coveredClientCard }),
  )
  await page.goto(CARD)

  const attendance = page.locator('[data-client-card-attendance]')
  await expect(attendance).toContainText('Cubriendo')
  await expect(attendance).toContainText('Cubres hasta')
  await expect(attendance).toContainText('12')
  await expect(attendance).not.toContainText('11')
})

test('being assigned to her is not the same as being allowed anything', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientCard: clientCardWithoutSections,
    }),
  )
  await page.goto(CARD)

  await expect(page.getByText('Todavía no te autorizó ninguna categoría')).toBeVisible()
  // Nothing withdrawn is not a panel saying so.
  await expect(page.getByText('Lo que retiró')).toHaveCount(0)
})

/*
 * `HU-STUDIO-084`. For thirty days the card says why instead of disappearing,
 * so the coach does not read it as the product failing. It carries no name of
 * hers and never who decided it.
 */
test('explains a client the caller no longer attends, and names nobody', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: formerClientCard }),
  )
  await page.goto(CARD)

  await expect(page.getByText('Ya no la atiendes')).toBeVisible()
  await expect(page.getByText('Dejaste de ser quien la atiende')).toBeVisible()
  await expect(page.getByText('Ana Álvarez')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Volver a clientes' })).toBeVisible()
})

/*
 * Absent and not-attended are the same answer, and the copy commits to neither:
 * saying the person exists but is not yours would reveal that the gym has her
 * as a client.
 */
test('a card that is not the callers says so without saying she exists', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: null }),
  )
  await page.goto(CARD)

  await expect(page.getByText('No encontramos esta ficha')).toBeVisible()
  await expect(page.getByText('Ana Álvarez')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Volver a clientes' })).toBeVisible()
})

/*
 * The directory is where a coach starts. Every row he can see is somebody he
 * attends, so his way in is the card; the relationship is one click further,
 * for when he needs to know how the gym stands with her.
 */
test('a coach opens the card from the directory, and the relationship from there', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
  await page.goto(DIRECTORY)

  await page.getByRole('link', { name: 'Ana Álvarez' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/clients/people/${PERSON}$`))

  await page.getByRole('link', { name: 'Ver el vínculo' }).click()
  await expect(page).toHaveURL(new RegExp(`/clients/${clientCard.relationship.id}$`))
})

/*
 * A reader of the whole organization is sent to the relationship instead:
 * `OP-REL-019` answers them the same 404 as for somebody who does not exist, so
 * the card would be a dead end.
 */
test('a reader of the whole gym is sent to the relationship, not to the card', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(DIRECTORY)

  await page.getByRole('link', { name: 'Ana Álvarez' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/clients/${clientCard.relationship.id}$`))
})
