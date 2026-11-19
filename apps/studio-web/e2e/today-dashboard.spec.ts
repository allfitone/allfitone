/**
 * The home of an organization as a dashboard (`HU-STUDIO-081`): a scoreboard of
 * counts, a board of notices and the team under both.
 *
 * `screens.ts` already proves the panel arrives and which notices it draws.
 * What this file holds is what the dashboard added on top of that answer — the
 * figures, the two columns, the marks — and each of those is a second reading
 * of numbers the server sent, so each one is checked against the fixture and
 * never against the screen's own arithmetic.
 */
import { expect, test, type Page } from '@playwright/test'

import { DESKTOP, MOBILE } from './screens'
import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  secondActiveMembership,
  studioToday,
  studioTodayCoach,
  studioTodayEmpty,
} from './studio-api-mock'

const ORG = activeMembership.organization_id
const workspace = `/organizations/${ORG}`

async function openFullPanel(page: Page): Promise<void> {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(workspace)
  await expect(page.locator('[data-today-scoreboard]')).toBeVisible()
}

/** What a figure says, read the way a person reads it: number, label, detail. */
async function figures(page: Page): Promise<string[][]> {
  return page
    .locator('[data-today-figure]')
    .evaluateAll((items) =>
      items.map((item) => [
        item.querySelector('[data-today-figure-value]')?.textContent ?? '',
        item.querySelector('[data-today-figure-label]')?.textContent ?? '',
        item.querySelector('[data-today-figure-detail]')?.textContent ?? '',
      ]),
    )
}

test('the scoreboard counts what the notices carry, in the order of debt', async ({ page }) => {
  await openFullPanel(page)

  // Seven notices, five figures: who waits on a decision and which invitations
  // are open are one question each. Every number is a sum of the fixture's own.
  expect(await figures(page)).toEqual([
    ['3', 'Por decidir', '2 sin profesional · 1 por terminar'],
    ['6', 'Por revisar', 'clientes tuyos esta semana'],
    ['8', 'Invitaciones', '6 sin responder · 2 vencidas'],
    ['3', 'Clientes nuevos', 'en los últimos 7 días'],
    ['12', 'Equipo', 'integrantes con rol vigente'],
  ])

  // One tone raised, and only for the decision somebody is waiting on.
  await expect(page.locator('[data-today-figure-urgent]')).toHaveCount(1)
  await expect(page.locator('[data-today-figure="decisions"]')).toHaveAttribute(
    'data-today-figure-urgent',
    '',
  )

  // The day the answer was worked out, as the server dated it.
  await expect(page.locator('[data-today-day] time')).toHaveAttribute(
    'datetime',
    studioToday.generated_at,
  )
  await expect(page.getByText('Esto necesita tu atención hoy')).toBeVisible()
})

/*
 * The fourth criterion, on the scoreboard: what a coach's roles do not allow is
 * absent from the answer, so it has no figure either. A scoreboard that drew
 * "0 invitaciones" for her would be answering a question the server refused.
 */
test('a coach reads one figure, because six notices never arrived', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [secondActiveMembership],
      today: { ...studioTodayCoach, organization_id: secondActiveMembership.organization_id },
    }),
  )
  await page.goto(`/organizations/${secondActiveMembership.organization_id}`)
  await expect(page.locator('[data-today-scoreboard]')).toBeVisible()

  expect(await figures(page)).toEqual([['6', 'Por revisar', 'clientes tuyos esta semana']])
  await expect(page.locator('[data-today-figure-urgent]')).toHaveCount(0)
  await expect(page.locator('[data-today-state]')).toHaveCount(0)
})

test('a day with nothing waiting keeps its scoreboard and raises no tone', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [activeMembership],
      today: { ...studioTodayEmpty, organization_id: ORG },
    }),
  )
  await page.goto(workspace)

  await expect(page.locator('[data-today-status]')).toHaveText('Nada espera por ti ahora')
  expect(await figures(page)).toEqual([['1', 'Equipo', 'integrante con rol vigente']])
  await expect(page.locator('[data-today-figure-urgent]')).toHaveCount(0)
  await expect(page.locator('[data-today-board]')).toHaveCount(0)
})

/*
 * The board takes the display it is given. Held to the workspace's reading
 * canvas it sat in a third of a 1920px screen between two empty ones, which is
 * what the first version of this dashboard shipped to its first reader.
 */
test('the board takes as many columns as the display has room for', async ({ page }) => {
  await openFullPanel(page)

  const boxes = async (width: number) => {
    await page.setViewportSize({ width, height: 1080 })
    return page.locator('[data-today-notice]').evaluateAll((cards) =>
      cards.map((card) => {
        const box = card.getBoundingClientRect()
        return { left: Math.round(box.left), top: Math.round(box.top) }
      }),
    )
  }
  const columns = (cards: { left: number }[]) => new Set(cards.map((card) => card.left)).size

  const wide = await boxes(1920)
  expect(wide).toHaveLength(6)
  expect(columns(wide)).toBe(3)

  // What is left beside the board on that display is the page's own padding.
  const gutters = await page.evaluate(() => {
    const panel = document.querySelector('[data-today-panel]')?.getBoundingClientRect()
    const content = document.querySelector('[data-organization-content]')?.getBoundingClientRect()
    if (!panel || !content) return null
    return { left: panel.left - content.left, right: content.right - panel.right }
  })
  expect(gutters?.left).toBeLessThanOrEqual(48)
  expect(gutters?.right).toBeLessThanOrEqual(48)

  const desktop = await boxes(DESKTOP.width)
  expect(columns(desktop)).toBe(2)
  // The order of debt runs along the rows: the first two notices share a line.
  expect(desktop[0]?.top).toBe(desktop[1]?.top)
  expect(desktop[1]?.left).toBeGreaterThan(desktop[0]?.left ?? 0)
  expect(desktop[2]?.top).toBeGreaterThan(desktop[0]?.top ?? 0)

  const phone = await boxes(MOBILE.width)
  expect(columns(phone)).toBe(1)
  expect(phone.map((box) => box.top)).toEqual(
    [...phone.map((box) => box.top)].sort((a, b) => a - b),
  )

  // Five figures, a long masked contact and a long name, on the narrowest phone.
  await page.setViewportSize({ width: 320, height: 700 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('the figures sit beside the day when both fit, and under it when not', async ({ page }) => {
  await openFullPanel(page)

  const besideTheDay = async (width: number) => {
    await page.setViewportSize({ width, height: 1080 })
    return page.locator('[data-today-scoreboard]').evaluate((scoreboard) => {
      const lead = scoreboard.querySelector('[data-today-lead]')?.getBoundingClientRect()
      const figures = scoreboard.querySelector('[data-today-figures]')?.getBoundingClientRect()
      const tops = [...scoreboard.querySelectorAll('[data-today-figure]')].map((figure) =>
        Math.round(figure.getBoundingClientRect().top),
      )
      return {
        beside: Boolean(lead && figures && figures.left >= lead.right),
        // All five on one line: none dropped under the others.
        lines: new Set(tops).size,
      }
    })
  }

  expect(await besideTheDay(1920)).toEqual({ beside: true, lines: 1 })
  expect(await besideTheDay(DESKTOP.width)).toEqual({ beside: false, lines: 1 })
})

/*
 * Only the board leaves the reading canvas. A refusal is a sentence, and a
 * sentence stretched across a wide display is the thing that canvas prevents.
 */
test('a refusal keeps the reading canvas on a wide display', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [activeMembership], today: null }),
  )
  await page.goto(workspace)
  await expect(page.getByText('No puedes ver el estado de esta organización')).toBeVisible()

  const panel = await page.locator('[data-today-panel]').boundingBox()
  expect(panel?.width).toBeLessThanOrEqual(1024)
})

test('a single notice takes the whole board instead of half of it', async ({ page }) => {
  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height })
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [secondActiveMembership],
      today: { ...studioTodayCoach, organization_id: secondActiveMembership.organization_id },
    }),
  )
  await page.goto(`/organizations/${secondActiveMembership.organization_id}`)

  const card = await page.locator('[data-today-notice]').boundingBox()
  const scoreboard = await page.locator('[data-today-scoreboard]').boundingBox()
  expect(Math.round(card?.width ?? 0)).toBe(Math.round(scoreboard?.width ?? -1))
})

test('a closed week draws one mark per session that was due', async ({ page }) => {
  await openFullPanel(page)
  const training = page.locator('[data-today-notice-slot="training"]')

  // Five were due and three were never logged — the fixture's own numbers.
  const week = training.getByRole('link', { name: /Ana Álvarez/ }).locator('[data-today-ticks]')
  await expect(week.locator('[data-today-tick]')).toHaveCount(5)
  await expect(week.locator('[data-today-tick="logged"]')).toHaveCount(2)
  await expect(week.locator('[data-today-tick="missing"]')).toHaveCount(3)

  // The marks say nothing the sentence does not, so only the sentence is read.
  await expect(week).toHaveAttribute('aria-hidden', 'true')
  await expect(training.getByText('3 de 5 sesiones sin registrar')).toBeVisible()

  // No closed week, no marks: she is here for her results.
  const results = training.getByRole('link', { name: /Alejandro Rangel Buitrago/ })
  await expect(results.locator('[data-today-ticks]')).toHaveCount(0)
  await expect(results).toHaveAttribute(
    'href',
    `/organizations/${ORG}/clients/people/${studioToday.notices.training.items[1]?.person_id}`,
  )
})

/*
 * "y 5 más" leads somewhere only when a screen lists those five. The training
 * notice acts on one client at a time, so its remainder is a count and nothing
 * to press — a link there would open a register that cannot show the other four.
 */
test('what a notice left out is a way in only where a screen lists the rest', async ({ page }) => {
  await openFullPanel(page)

  const invitations = page.locator('[data-today-notice-slot="client-invitations"]')
  await expect(invitations.getByRole('link', { name: 'y 5 más' })).toHaveAttribute(
    'href',
    `/organizations/${ORG}/clients?status=invited`,
  )
  await expect(invitations.getByRole('link', { name: 'Ver invitados' })).toHaveAttribute(
    'href',
    `/organizations/${ORG}/clients?status=invited`,
  )

  const training = page.locator('[data-today-notice-slot="training"]')
  await expect(training.getByText('y 4 más')).toBeVisible()
  await expect(training.getByRole('link', { name: 'y 4 más' })).toHaveCount(0)

  // Two listed of two counted: nothing was left out, so nothing is said.
  await expect(
    page.locator('[data-today-notice-slot="unassigned"] [data-today-remainder]'),
  ).toHaveCount(0)
})

test('the team sits under the board as a state, one mark per member', async ({ page }) => {
  await openFullPanel(page)
  const team = page.getByRole('region', { name: 'Tu equipo' })

  // A state and not a seventh notice: the board still counts six.
  await expect(team).not.toHaveAttribute('data-today-notice', /.*/)
  await expect(page.locator('[data-today-notice]')).toHaveCount(6)

  const roles = await team.locator('[data-today-role]').evaluateAll((items) =>
    items.map((item) => ({
      words: item.querySelector('[data-today-role-name]')?.textContent ?? '',
      marks: item.querySelectorAll('[data-today-tick]').length,
    })),
  )
  // `physiotherapist` is a code this app has no word for, so the code stands in.
  expect(roles).toEqual([
    { words: '8 Coach', marks: 8 },
    { words: '2 Administrador', marks: 2 },
    { words: '1 Propietario', marks: 1 },
    { words: '1 physiotherapist', marks: 1 },
  ])

  await expect(team.getByRole('link', { name: 'Ver equipo', exact: true })).toHaveAttribute(
    'href',
    `/organizations/${ORG}/team`,
  )
})
