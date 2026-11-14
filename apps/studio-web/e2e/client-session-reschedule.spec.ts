import { expect, test } from '@playwright/test'

import {
  clientCard,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
} from './studio-api-mock'

/**
 * HU-STUDIO-048 — moving a managed session to another day of its own week.
 *
 * **The clock is pinned.** The fixture's weeks are literal dates, and the three
 * bounds the server applies are all relative to today, so a suite reading the
 * real clock would answer differently every day and stop exercising the happy
 * path the moment those weeks fell behind. Pinning the browser's time keeps the
 * fixture honest and the assertions deterministic.
 *
 * Tuesday the 13th of October sits inside the second week of the first
 * programme (`2026-10-12` … `2026-10-18`), which is where the movable session
 * lives.
 */

const ORG = holderMembership.organization_id
const PROGRAMS = `/organizations/${ORG}/clients/people/${clientCard.person_id}/programs`
const INSIDE_THE_WEEK = '2026-10-13T15:00:00.000Z'

/** The session on the 14th: scheduled, unstarted, and inside the pinned week. */
const MOVABLE = '14/10/2026'
/** The one she started, on the 12th. It is the row that must stay plain text. */
const STARTED = '12/10/2026'

async function open(
  page: import('@playwright/test').Page,
  fixture = createStudioApiFixture({ memberships: [holderMembership] }),
) {
  await page.clock.setFixedTime(new Date(INSIDE_THE_WEEK))
  await installStudioApiMock(page, fixture)
  await page.goto(PROGRAMS)
  await expect(page.getByText('2 de 6 sesiones hechas')).toBeVisible()
}

/**
 * The first programme's movable day. The second programme has a scheduled
 * session too, in a week of its own, so an unscoped locator matches two.
 */
function movable(page: import('@playwright/test').Page) {
  return page.locator('[data-client-program]').first().locator('[data-client-session-move]')
}

test('offers the move on the day of a session that can move, and not on the others', async ({
  page,
}) => {
  await open(page)

  const program = page.locator('[data-client-program]').first()
  // Six sessions, and only one of them can move: two she finished, one already
  // cancelled, one she started, one paused, and the scheduled one.
  await expect(program.locator('[data-client-program-session]')).toHaveCount(6)
  await expect(program.locator('[data-client-session-move]')).toHaveCount(1)
  await expect(program.locator('[data-client-session-move]')).toHaveText(MOVABLE)
  await expect(program.getByText(STARTED, { exact: true })).toBeVisible()
})

test('says the three bounds and what does not change, before any day is chosen', async ({
  page,
}) => {
  await open(page)
  await movable(page).click()

  const dialog = page.locator('[data-client-session-move-dialog]')
  await expect(dialog).toContainText('¿Mover «Tren superior» a otro día?')
  await expect(dialog).toContainText('Solo dentro de su propia semana')
  await expect(dialog).toContainText('desde hoy en adelante')
  await expect(dialog).toContainText('nunca antes de que empiece el programa')
  // The fifth criterion: moving a day does not rewrite the week.
  await expect(dialog).toContainText('la rutina, sus objetivos y la semana a la que pertenece')
  /*
   * The day it is on starts selected, so there is nothing to confirm until a
   * different one is chosen — picking its own day is the no-op the contract
   * allows and the screen does not send.
   */
  await expect(page.getByRole('button', { name: 'Mover a ese día' })).toBeDisabled()
})

/*
 * The week is seven days, and where the session stands is said by the picker's
 * own selection rather than by a word beside it. Monday is past and closed;
 * Wednesday is the day it is on, selected and still choosable because picking
 * it changes nothing; the rest are open.
 */
test('draws the whole week, with the past closed and its own day selected', async ({ page }) => {
  await open(page)
  await movable(page).click()

  const days = page.locator('[data-client-session-move-week] button')
  await expect(days).toHaveCount(7)
  await expect(days.nth(0)).toBeDisabled()
  await expect(days.nth(1)).toBeEnabled()
  await expect(days.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await expect(days.nth(2)).toBeEnabled()
  await expect(days.nth(6)).toBeEnabled()
  // No word for it: the selection is the whole marker.
  await expect(page.locator('[data-client-session-move-dialog]')).not.toContainText('hoy está')

  // And choosing elsewhere moves the mark, which is what makes it readable.
  await days.nth(5).click()
  await expect(days.nth(5)).toHaveAttribute('aria-pressed', 'true')
  await expect(days.nth(2)).toHaveAttribute('aria-pressed', 'false')
})

test('moves the session to the chosen day and shows it there', async ({ page }) => {
  await open(page)
  await movable(page).click()
  await page.locator('[data-client-session-move-week] button').nth(5).click()
  await page.getByRole('button', { name: 'Mover a ese día' }).click()

  await expect(page.locator('[data-client-session-move-dialog]')).toHaveCount(0)
  const program = page.locator('[data-client-program]').first()
  await expect(program.locator('[data-client-session-move]')).toHaveText('17/10/2026')
  // Still six sessions: a move is not a creation.
  await expect(program.locator('[data-client-program-session]')).toHaveCount(6)
})

test('leaving it alone sends nothing and changes nothing', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [holderMembership] })
  await open(page, fixture)
  await movable(page).click()
  await page.getByRole('button', { name: 'Dejarla en su día' }).click()

  await expect(page.locator('[data-client-session-move-dialog]')).toHaveCount(0)
  await expect(movable(page)).toHaveText(MOVABLE)
  expect(fixture.requests.some((request) => request.method === 'PATCH')).toBe(false)
})

/**
 * The refusal that is not an error. Somebody moved the session while the dialog
 * was open, and the answer hands back the session as it stands — so the screen
 * **shows that day** instead of losing either version.
 */
test('a session that moved meanwhile says so and names the day it is on now', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], rescheduleOutcome: 'stale-draft' }),
  )
  await movable(page).click()
  await page.locator('[data-client-session-move-week] button').nth(5).click()
  await page.getByRole('button', { name: 'Mover a ese día' }).click()

  const failure = page.locator('[data-client-session-move-error]')
  await expect(failure).toContainText('se movió mientras la mirabas')
  await expect(failure).toContainText('15/10/2026')
  // The dialog stays open over it, so the coach can choose again from there.
  await expect(page.locator('[data-client-session-move-dialog]')).toBeVisible()
})

test('a paused service says where it is resolved, which is not here', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      rescheduleOutcome: 'service-paused',
    }),
  )
  await movable(page).click()
  await page.locator('[data-client-session-move-week] button').nth(5).click()
  await page.getByRole('button', { name: 'Mover a ese día' }).click()

  const failure = page.locator('[data-client-session-move-error]')
  await expect(failure).toContainText('reactivándolo o terminando el vínculo')
  await expect(failure).toContainText('no sesión por sesión')
})

test('the other conflict names both of its causes and sends the coach to re-read', async ({
  page,
}) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], rescheduleOutcome: 'conflict' }),
  )
  await movable(page).click()
  await page.locator('[data-client-session-move-week] button').nth(5).click()
  await page.getByRole('button', { name: 'Mover a ese día' }).click()

  await expect(page.locator('[data-client-session-move-error]')).toContainText(
    'o ella ya empezó esta sesión, o este programa ya no lo administramos',
  )
})

test('a day the server refuses names the rule, not the field', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], rescheduleOutcome: 'invalid-day' }),
  )
  await movable(page).click()
  await page.locator('[data-client-session-move-week] button').nth(5).click()
  await page.getByRole('button', { name: 'Mover a ese día' }).click()

  await expect(page.locator('[data-client-session-move-error]')).toContainText(
    'tiene que ser de esta misma semana',
  )
})

/*
 * She shared her training only to read. The screen decides before asking, so no
 * day is a control at all — and the reason is already on screen, because the
 * same permission governs assigning.
 */
test('is not offered at all when she shared her training only to read', async ({ page }) => {
  const readOnly = {
    ...clientCard,
    sections: clientCard.sections.map((section) =>
      section.scope_code === 'relationship_training'
        ? { ...section, access_level: 'read' }
        : section,
    ),
  }
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: readOnly }),
  )

  await expect(page.locator('[data-client-session-move]')).toHaveCount(0)
  await expect(page.getByText(MOVABLE, { exact: true }).first()).toBeVisible()
})

/*
 * Every week of the fixture behind her. Each session still passes everything
 * the server checks — scheduled, unstarted, managed, authorized — and has
 * nowhere inside its own week to go, so no day is a control. A button that
 * could only answer "no" is worse than the plain day it replaces.
 */
test('draws no control at all once every week is behind her', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-13T15:00:00.000Z'))
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
  await page.goto(PROGRAMS)
  await expect(page.getByText('2 de 6 sesiones hechas')).toBeVisible()

  await expect(page.locator('[data-client-session-move]')).toHaveCount(0)
  await expect(page.getByText(MOVABLE, { exact: true }).first()).toBeVisible()
})
