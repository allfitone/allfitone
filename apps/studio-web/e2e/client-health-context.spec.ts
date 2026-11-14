import { expect, test } from '@playwright/test'

import {
  clientCard,
  clientHealthContext,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
  narrowHealthContext,
} from './studio-api-mock'

/**
 * HU-STUDIO-053 — the health context a client shares with her coach.
 *
 * The narrowing is the database's: it reads only what she declared, and gates
 * each field on the version she accepted. The screen's half is to say what
 * arrived, sort it by what holds today, and never describe what did not arrive.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const CARD = `/organizations/${ORG}/clients/people/${PERSON}`
const HEALTH = `${CARD}/health-context`

function claimsAt(page: import('@playwright/test').Page, section: string) {
  return page.locator(`[data-client-health-section="${section}"] [data-client-health-claim]`)
}

test.beforeEach(async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
})

/*
 * Criterion 2: a pain, a limitation and a recovery, each in words — never the
 * code — with her own description and where it came from.
 */
test('shows what she declared, in words rather than codes', async ({ page }) => {
  await page.goto(HEALTH)

  await expect(page.getByRole('heading', { level: 1, name: 'Contexto de salud' })).toBeVisible()
  await expect(page.getByText('Dolor · Rodilla')).toBeVisible()
  await expect(page.getByText('Me duele al bajar escaleras')).toBeVisible()
  await expect(page.getByText('Limitación', { exact: true })).toBeVisible()
  await expect(page.getByText(/Lo observó un profesional/)).toBeVisible()
  await expect(page.getByText('Recuperación · Hombro')).toBeVisible()

  await expect(page.getByText(/\b(pain|limitation|recovery|lower_back|knee)\b/)).toHaveCount(0)
})

/*
 * What no longer holds still arrives and is shown — a coach needs to know there
 * was an injury last month. It is sorted, not filtered: what affects her today,
 * what is healing, then what ended.
 */
test('sorts by what holds today, and keeps what already ended', async ({ page }) => {
  await page.goto(HEALTH)

  const titles = page.locator('[data-client-health-section-name]')
  await expect(titles).toHaveText(['Lo que la afecta hoy', 'En recuperación', 'Lo que ya terminó'])
  await expect(claimsAt(page, 'current')).toHaveCount(2)
  await expect(claimsAt(page, 'healing')).toContainText('hasta el 31 de marzo de 2027')
  await expect(claimsAt(page, 'ended')).toContainText('Lumbalgia después de una carrera')
  await expect(claimsAt(page, 'ended')).toContainText(
    'Del 3 de abril de 2026 al 10 de mayo de 2026',
  )
})

/*
 * Criterion 3, said before anything is read: no clinical history, diagnosis,
 * test or medical document exists to be shared, under any permission.
 */
test('says that nothing clinical can arrive here', async ({ page }) => {
  await page.goto(HEALTH)

  await expect(
    page.getByText(/no guarda historia clínica, diagnósticos, exámenes ni documentos médicos/),
  ).toBeVisible()
})

/*
 * A version that carries only the type and the dates. The description, the area
 * and the origin are left out of the line, and none of them is described as
 * missing: «sin origen» would claim the datum has none.
 */
test('a field the version withholds is left out, never filled in', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientHealthContext: narrowHealthContext,
    }),
  )
  await page.goto(HEALTH)

  await expect(claimsAt(page, 'current').first()).toContainText('Dolor')
  await expect(page.locator('[data-client-health-claim-description]')).toHaveCount(0)
  await expect(page.getByText(/sin origen|sin registrar|sin descripci|no disponible/i)).toHaveCount(
    0,
  )
  await expect(page.getByText('Rodilla')).toHaveCount(0)
})

test('says which version of the permission it is reading', async ({ page }) => {
  await page.goto(HEALTH)

  await expect(page.getByText('Versión 2 del permiso de contexto de salud')).toBeVisible()
})

test('sharing the category and nothing in it is a state, not a failure', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientHealthContext: [] }),
  )
  await page.goto(HEALTH)

  await expect(page.getByText('No hay nada de su contexto de salud')).toBeVisible()
  await expect(page.locator('[data-client-health-section]')).toHaveCount(0)
})

/*
 * Criterion 1: the most restrictive of the four permissions. Without it nothing
 * of hers is drawn, and there is no retry: it would refuse again and be recorded.
 */
test('without the health permission it shows nothing, and says what is missing', async ({
  page,
}) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientHealthContext: null }),
  )
  await page.goto(HEALTH)

  await expect(page.getByText('No te autorizó su contexto de salud')).toBeVisible()
  await expect(page.locator('[data-client-health-claim]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
})

test('a person the caller does not attend has no health context to open', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: null }),
  )
  await page.goto(HEALTH)

  await expect(page.getByText('No encontramos este contexto de salud')).toBeVisible()
})

/*
 * Twenty at a time: the second page is reached only by asking, because each page
 * is a read recorded for her.
 */
test('a long list is read a page at a time, only when asked', async ({ page }) => {
  const many = Array.from({ length: 23 }, (_, index) => ({
    ...clientHealthContext[0],
    id: `01991600-7000-7000-8000-0000000004${String(index).padStart(2, '0')}`,
  }))
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientHealthContext: many }),
  )
  await page.goto(HEALTH)

  await expect(page.locator('[data-client-health-claim]')).toHaveCount(20)
  await page.getByRole('button', { name: 'Ver más' }).click()
  await expect(page.locator('[data-client-health-claim]')).toHaveCount(23)
  await expect(page.getByRole('button', { name: 'Ver más' })).toHaveCount(0)
})

/*
 * Every answer is a read she sees. Returning to the window must not write her
 * another one: what would be logged then is the window's focus.
 */
test('asks once on arrival and never again on its own', async ({ page }) => {
  const reads: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/studio/v1/') && pathname.endsWith('/health-context')) {
      reads.push(request.url())
    }
  })

  await page.goto(HEALTH)
  await expect(page.getByText('Dolor · Rodilla')).toBeVisible()
  expect(reads).toHaveLength(1)

  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByText('Dolor · Rodilla')).toBeVisible()
  expect(reads).toHaveLength(1)
})

/*
 * The card is the way in: the health category, which names this read, carries
 * the one door to it.
 */
test('is opened from the health section of the card', async ({ page }) => {
  await page.goto(CARD)
  await expect(page.getByRole('heading', { name: 'Contexto de salud' })).toBeVisible()

  const doors = page.locator('[data-client-card-door="listAuthorizedClientHealthContext"]')
  await expect(doors).toHaveCount(1)

  await doors.click()
  await expect(page).toHaveURL(new RegExp(`${PERSON}/health-context$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Contexto de salud' })).toBeVisible()

  await page.getByRole('link', { name: 'Volver a su ficha' }).click()
  await expect(page).toHaveURL(new RegExp(`people/${PERSON}$`))
})
