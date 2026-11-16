import { expect, test } from '@playwright/test'

import {
  clientCard,
  createStudioApiFixture,
  formerClientCard,
  holderMembership,
  installStudioApiMock,
  relationshipAssignments,
} from './studio-api-mock'

/**
 * HU-STUDIO-047 — the programs this relationship gave a person.
 *
 * The first two criteria are the operation's: it is keyed by the relationship,
 * so what she took on her own and what another gym gave her are never in the
 * answer to filter out. What is checked here is the half the screen owns — that
 * it draws what came back in the order it came back, that it counts only where
 * there is a total to count against, that it never names what an adjustment
 * changed, and that it tells a coach who lost her why there is nothing instead
 * of asking for it anyway.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const CARD = `/organizations/${ORG}/clients/people/${PERSON}`
const PROGRAMS = `${CARD}/programs`

test.beforeEach(async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
})

test('lists her programs in the order the server answered', async ({ page }) => {
  await page.goto(PROGRAMS)

  await expect(page.getByRole('heading', { level: 1, name: 'Programas asignados' })).toBeVisible()
  const programs = page.locator('[data-client-program]')
  await expect(programs).toHaveCount(3)
  await expect(programs.locator('[data-client-program-title]')).toHaveText([
    'Fuerza general · bloque de otoño',
    'Movilidad diaria',
    'Iniciación en sala',
  ])
  // The version matters: the gym may already be on a later one than hers.
  await expect(programs.first()).toContainText('Versión 3')
})

/*
 * The point of the whole screen. A finite version is planted whole when it is
 * assigned, so its calendar is a real denominator; an open-ended one grows a
 * week at a time, and counting against what has grown so far would measure her
 * against a total that moves every week.
 */
test('counts against a total only where there is one', async ({ page }) => {
  await page.goto(PROGRAMS)
  const programs = page.locator('[data-client-program]')

  await expect(programs.nth(0).locator('[data-client-program-progress]')).toHaveText(
    '2 de 6 sesiones hechas',
  )
  await expect(programs.nth(0)).toContainText('La agenda quedó sembrada entera')

  await expect(programs.nth(1).locator('[data-client-program-progress]')).toHaveText(
    '1 sesión hecha',
  )
  await expect(programs.nth(1)).toContainText('la agenda crece una semana a la vez')
})

/*
 * The adjustments arrive ordered by step and kind, never by date, so a screen
 * that took the last of them would name 11 October. The latest is 19 October,
 * and it sits in the middle of the array on purpose.
 */
test('names the most recent adjustment, not the last one in the list', async ({ page }) => {
  await page.goto(PROGRAMS)
  const adjustments = page.locator('[data-client-program-adjustments]')

  await expect(adjustments).toHaveCount(1)
  await expect(adjustments).toContainText('Ajustado para ella 3 veces')
  await expect(adjustments).toContainText('19/10/2026')
})

/*
 * Nothing on the screen may say what a revision changed: each one points at a
 * `planned_step_id` and this answer carries no steps, so a sentence naming one
 * would be invented. The ids themselves must not leak either.
 */
test('never says what an adjustment changed', async ({ page }) => {
  await page.goto(PROGRAMS)
  const body = page.locator('[data-client-programs-screen]')

  await expect(body).not.toContainText('target_load')
  await expect(body).not.toContainText('target_reps')
  await expect(body).not.toContainText('42,5')
  await expect(body).not.toContainText('019f4900-0000-7000-8000-00000000c001')
})

/* Management ending is not the program ending, and the two are said apart. */
test('says when the gym stopped running a program', async ({ page }) => {
  await page.goto(PROGRAMS)
  const programs = page.locator('[data-client-program]')

  await expect(programs.nth(0).locator('[data-client-program-managed]')).toContainText(
    'Lo administramos desde el',
  )
  await expect(programs.nth(2).locator('[data-client-program-managed]')).toHaveText(
    'Ya no lo administramos: el plan quedó en sus manos',
  )
  // It ended, which the badge says; the two facts do not stand in for each other.
  await expect(programs.nth(2).locator('[data-client-program-status]')).toHaveText('Terminado')
})

test('draws the planted calendar, with the state of each session', async ({ page }) => {
  await page.goto(PROGRAMS)
  const sessions = page.locator('[data-client-program]').first().locator('tbody tr')

  await expect(sessions).toHaveCount(6)
  await expect(sessions.nth(0)).toContainText('Tren inferior')
  await expect(sessions.nth(0)).toContainText('Hecha')
  await expect(sessions.nth(2)).toContainText('Cancelada')
  await expect(sessions.nth(5)).toContainText('En pausa')
})

/*
 * The register declares fixed column shares, so a title longer than its share
 * paints over the column beside it unless it is allowed to wrap. The fixture
 * carries a title of 156 characters against a column capped at 160, which is
 * the longest one a coach can type — a comfortable title would let the shares
 * ship untested.
 */
test('a session title longer than its column wraps instead of leaving it', async ({ page }) => {
  await page.goto(PROGRAMS)

  const long = page
    .locator('[data-client-program-session-title]')
    .filter({ hasText: 'respiración diafragmática' })
    .first()
  await expect(long).toBeVisible()

  const measured = await long.evaluate((title) => {
    const cell = title.closest('td')
    if (!cell) return { lines: 0, past: 0 }
    const range = document.createRange()
    range.selectNodeContents(title)
    return {
      lines: title.getClientRects().length,
      past: Math.round(range.getBoundingClientRect().right - cell.getBoundingClientRect().right),
    }
  })
  expect(measured.lines).toBeGreaterThan(1)
  expect(measured.past).toBeLessThanOrEqual(0)
})

/* A started session is still a scheduled one — and it is the one that can no
   longer be moved, which is why the fact has a field of its own. */
test('says which session she already started', async ({ page }) => {
  await page.goto(PROGRAMS)
  const started = page.locator('[data-client-program-session-started]')

  await expect(started).toHaveCount(1)
  await expect(started).toHaveText('Ya la empezó')
  await expect(
    page.locator('[data-client-program] tbody tr').filter({ hasText: 'Ya la empezó' }),
  ).toContainText('Programada')
})

/*
 * The card is read for the relationship's id and nothing else of hers is asked
 * for. Opening a card reads none of her data and writes no access event, so
 * this screen records exactly one access — the story's fourth criterion.
 */
test('reads her card once and her programs once, and nothing else', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.includes('/studio/v1/')) asked.push(url.pathname)
  })

  await page.goto(PROGRAMS)
  await expect(page.locator('[data-client-program]')).toHaveCount(3)

  const hers = asked.filter(
    (path) => path.includes(`/clients/${PERSON}`) || path.includes('/assignments'),
  )
  expect(hers).toEqual([
    `/studio/v1/organizations/${ORG}/clients/${PERSON}`,
    `/studio/v1/organizations/${ORG}/relationships/${clientCard.relationship.id}/assignments`,
  ])
})

test('nothing assigned yet is said as that, and never as a failure', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], relationshipAssignments: [] }),
  )
  await page.goto(PROGRAMS)

  await expect(page.getByText('Todavía no le asignamos ningún programa')).toBeVisible()
  await expect(page.locator('[data-client-program]')).toHaveCount(0)
})

/* Her training is not shared, so there is nothing to answer — not an empty
   list, which would be a different claim. */
test('no training permission is a refusal, not an empty list', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], relationshipAssignments: null }),
  )
  await page.goto(PROGRAMS)

  await expect(page.getByText('No te autorizó su entrenamiento')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver su ficha' })).toBeVisible()
  await expect(page.getByText('Todavía no le asignamos')).toHaveCount(0)
})

/*
 * Criterion 3. The link ended, so the detached program and its later sessions
 * are no longer answered at all — and the screen says so from the card instead
 * of firing a read that could only be refused.
 */
test('a coach who lost her is told why, and asks for nothing', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/assignments')) asked.push(request.url())
  })

  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: formerClientCard }),
  )
  await page.goto(PROGRAMS)

  await expect(page.getByText('Ya no la atiendes')).toBeVisible()
  await expect(page.getByText('sus programas dejan de verse desde aquí')).toBeVisible()
  expect(asked).toEqual([])
})

test('a person the caller does not attend is the same answer as one who is not there', async ({
  page,
}) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: null }),
  )
  await page.goto(PROGRAMS)

  await expect(page.getByText('No encontramos estos programas')).toBeVisible()
})

test.describe('more programs than one page holds', () => {
  /* Twelve against a page of ten, so «Ver más» is the only way to the last two. */
  const template = relationshipAssignments[0]
  if (!template) throw new Error('the assignments fixture is empty')
  const many = () =>
    Array.from({ length: 12 }, (_, index) => ({
      ...template,
      id: `019f4900-0000-7000-8000-0000000e${String(index).padStart(4, '0')}`,
      program_version: { ...template.program_version, title: `Programa ${String(index + 1)}` },
    }))

  test('the pager brings the rest', async ({ page }) => {
    await installStudioApiMock(
      page,
      createStudioApiFixture({ memberships: [holderMembership], relationshipAssignments: many() }),
    )
    await page.goto(PROGRAMS)

    await expect(page.locator('[data-client-program]')).toHaveCount(10)
    await page.getByRole('button', { name: 'Ver más' }).click()
    await expect(page.locator('[data-client-program]')).toHaveCount(12)
    await expect(page.getByRole('button', { name: 'Ver más' })).toHaveCount(0)
  })

  test('a cursor the server will not read again offers starting over', async ({ page }) => {
    await installStudioApiMock(
      page,
      createStudioApiFixture({
        memberships: [holderMembership],
        relationshipAssignments: many(),
        assignmentsCursor: 'stale',
      }),
    )
    await page.goto(PROGRAMS)

    await page.getByRole('button', { name: 'Ver más' }).click()
    await expect(page.getByText('La lista cambió mientras la leías')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Empezar de nuevo' })).toBeVisible()
  })
})

test('the card is one click away, and so is the directory', async ({ page }) => {
  await page.goto(PROGRAMS)

  await page.getByRole('link', { name: 'Volver a su ficha' }).click()
  await expect(page).toHaveURL(new RegExp(`${PERSON}$`))
})
