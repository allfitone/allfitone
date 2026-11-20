/**
 * How the organization is doing, under what needs attention (`HU-STUDIO-081`,
 * criterion 8): adherence, relationships begun and ended, and the clients each
 * professional holds.
 *
 * The Design System proves how a chart is drawn. What this file holds is what
 * Studio decides around it: which panels an answer gets, what each one says
 * when there is nothing to plot, and that every figure on the screen is one the
 * fixture sent. The figures are read from the table each chart carries, which is
 * the same data the plot draws and the only form of it a test can read exactly.
 */
import { expect, test, type Page } from '@playwright/test'

import { MOBILE } from './screens'
import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  secondActiveMembership,
  studioToday,
  studioTodayCoach,
  studioTodayEmpty,
  type StudioApiFixture,
} from './studio-api-mock'

const ORG = activeMembership.organization_id
const workspace = `/organizations/${ORG}`

/**
 * Opens the workspace and waits for as many panels as the answer should draw.
 *
 * They arrive after the rest, in a download of their own, and a plot draws only
 * once it knows its width. Reading the page before both would read a placeholder.
 */
async function open(
  page: Page,
  panels: number,
  today: unknown = studioToday,
): Promise<StudioApiFixture> {
  const fixture = createStudioApiFixture({ memberships: [activeMembership], today })
  await installStudioApiMock(page, fixture)
  await page.goto(workspace)
  await expect(page.locator('[data-today-scoreboard]')).toBeVisible()
  await drawn(page, panels)
  return fixture
}

async function drawn(page: Page, panels: number): Promise<void> {
  await expect(page.locator('[data-today-indicator]')).toHaveCount(panels)
  for (const plot of await page.locator('[data-slot="chart-plot"]').all()) {
    await expect(plot.locator('svg').first()).toBeVisible()
  }
}

/** The rows of the table a chart carries: its position, then one cell a series. */
async function tableRows(page: Page, slot: string): Promise<string[][]> {
  return page
    .locator(`[data-today-indicator="${slot}"] [data-slot="chart-table"] tbody tr`)
    .evaluateAll((rows) =>
      rows.map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent ?? '')),
    )
}

test('an owner who coaches reads all three, between the board and the team', async ({ page }) => {
  await open(page, 3)

  const panels = page.locator('[data-today-indicator]')
  await expect(panels).toHaveCount(3)
  await expect(panels.getByRole('heading')).toHaveText([
    'Adherencia de tus clientes',
    'Altas y bajas de clientes',
    'Clientes por profesional',
  ])

  // States, so they follow what waits on somebody and sit with the team.
  const tops = await page.evaluate(() => {
    const top = (selector: string) =>
      Math.round(document.querySelector(selector)?.getBoundingClientRect().top ?? -1)
    return {
      board: top('[data-today-board]'),
      indicators: top('[data-today-indicators]'),
      team: top('[data-today-state]'),
    }
  })
  expect(tops.indicators).toBeGreaterThan(tops.board)
  expect(tops.team).toBeGreaterThan(tops.indicators)

  // Nothing here waits on anybody, so the board still counts its six notices.
  await expect(page.locator('[data-today-notice]')).toHaveCount(6)
})

test('adherence says each week as a rate and as the sessions behind it', async ({ page }) => {
  await open(page, 3)

  const rows = await tableRows(page, 'adherence')
  expect(rows).toHaveLength(8)
  // 34 of 52 and 48 of 56: the fixture's own numbers, never the screen's.
  expect(rows[0]).toEqual(['Semana del 14 de septiembre', '65 % · 34 de 52 sesiones'])
  expect(rows[7]).toEqual(['Semana del 2 de noviembre', '86 % · 48 de 56 sesiones'])

  await expect(
    page.getByRole('figure', { name: 'Adherencia de tus clientes, semana a semana' }),
  ).toBeVisible()
})

/*
 * A week that asked for nothing has no rate. Drawn as 0 % it would say her
 * clients skipped a week in which nobody had a session.
 */
test('a week with nothing due is a gap, and is said as one', async ({ page }) => {
  const weeks = studioToday.indicators.training_adherence.weeks.map((week, index) =>
    index === 3 ? { ...week, planned: 0, logged: 0 } : week,
  )
  await open(page, 1, {
    ...studioToday,
    indicators: { training_adherence: { clients: 6, weeks } },
  })

  const rows = await tableRows(page, 'adherence')
  expect(rows[3]).toEqual(['Semana del 5 de octubre', 'Sin sesiones planeadas'])
  expect(rows.filter(([, value]) => value?.includes('%'))).toHaveLength(7)
})

test('relationships begun and ended are told apart by name, month by month', async ({ page }) => {
  await open(page, 3)

  const changes = page.locator('[data-today-indicator="relationship-changes"]')
  await expect(changes.locator('[data-slot="chart-legend"] li')).toHaveText(['Altas', 'Bajas'])

  const rows = await tableRows(page, 'relationship-changes')
  expect(rows).toEqual([
    ['Junio de 2026', '4', '1'],
    ['Julio de 2026', '6', '2'],
    ['Agosto de 2026', '3', '3'],
    ['Septiembre de 2026', '7', '1'],
    ['Octubre de 2026', '5', '2'],
    ['Noviembre de 2026', '8', '1'],
  ])
})

test('the load lists every coach in the order sent, the one with nobody too', async ({ page }) => {
  await open(page, 3)

  const load = page.locator('[data-today-indicator="professional-load"]')
  const rows = await load
    .locator('[data-slot="bar-list-item"]')
    .evaluateAll((items) =>
      items.map((item) => [
        item.querySelector('[data-slot="bar-list-label"]')?.textContent ?? '',
        item.querySelector('[data-slot="bar-list-value"]')?.textContent ?? '',
      ]),
    )
  expect(rows).toEqual(
    studioToday.indicators.professional_load.items.map((item) => [
      item.display_name,
      String(item.clients),
    ]),
  )
  expect(rows.at(-1)).toEqual(['Sofía Peña', '0'])

  // Eight listed of eight counted: nothing was left out, so nothing is said.
  await expect(load.locator('[data-today-indicator-more]')).toHaveCount(0)
})

test('a load longer than its list says how many more and leads to the team', async ({ page }) => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    membership_id: `01991600-7000-7000-8000-0000000004${String(index).padStart(2, '0')}`,
    display_name: `Coach ${index + 1}`,
    clients: 12 - index,
  }))
  await open(page, 1, {
    ...studioToday,
    indicators: { professional_load: { count: 15, unassigned: 0, items } },
  })

  const load = page.locator('[data-today-indicator="professional-load"]')
  await expect(load.locator('[data-slot="bar-list-item"]')).toHaveCount(12)
  await expect(load.getByRole('link', { name: 'y 3 más' })).toHaveAttribute(
    'href',
    `/organizations/${ORG}/team`,
  )
})

/*
 * The fourth criterion again: an indicator her roles do not open never arrived,
 * so it has no panel. An empty «altas y bajas» for a coach would be an answer to
 * a question the server refused.
 */
test('a coach reads adherence and nothing about the organization', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [secondActiveMembership],
      today: { ...studioTodayCoach, organization_id: secondActiveMembership.organization_id },
    }),
  )
  await page.goto(`/organizations/${secondActiveMembership.organization_id}`)

  await drawn(page, 1)
  await expect(page.locator('[data-today-indicator="adherence"]')).toBeVisible()
  await expect(page.getByText('Altas y bajas de clientes')).toHaveCount(0)
  await expect(page.getByText('Clientes por profesional')).toHaveCount(0)
})

test('a panel with nothing to plot says so instead of drawing empty axes', async ({ page }) => {
  await open(page, 2, { ...studioTodayEmpty, organization_id: ORG })

  await expect(page.getByText('Sin altas ni bajas en los últimos seis meses.')).toBeVisible()
  await expect(page.getByText('Ningún integrante tiene el rol de coach.')).toBeVisible()
  await expect(page.locator('[data-slot="chart"]')).toHaveCount(0)
  await expect(page.locator('[data-slot="bar-list"]')).toHaveCount(0)

  // Still a day with nothing waiting: a state never makes it otherwise.
  await expect(page.locator('[data-today-status]')).toHaveText('Nada espera por ti ahora')
})

test('eight weeks that asked for nothing are said, not plotted', async ({ page }) => {
  const weeks = studioToday.indicators.training_adherence.weeks.map((week) => ({
    ...week,
    planned: 0,
    logged: 0,
  }))
  await open(page, 1, {
    ...studioTodayCoach,
    indicators: { training_adherence: { clients: 0, weeks } },
  })

  await expect(page.getByText('No hubo sesiones planeadas en estas ocho semanas.')).toBeVisible()
  await expect(page.locator('[data-slot="chart"]')).toHaveCount(0)
})

/*
 * The API ships before the database, so for a while the answer has no
 * `indicators` at all. That is an answer, and the panel is whole without them.
 */
test('an answer without indicators draws the panel as it was', async ({ page }) => {
  const { indicators: _absent, ...before } = studioToday
  await open(page, 0, before)

  await expect(page.locator('[data-today-notice]')).toHaveCount(6)
  await expect(page.getByRole('region', { name: 'Tu equipo' })).toBeVisible()
  await expect(page.locator('[data-today-indicators]')).toHaveCount(0)
  await expect(page.locator('[data-today-indicators-placeholder]')).toHaveCount(0)
})

/*
 * A month is cut in the viewer's timezone, so the read carries the one the
 * browser reports. Without it the server leaves that indicator out.
 *
 * Counted on a production build, as CI runs it. A development server mounts
 * twice and abandons its first read, so there the same count is two.
 */
test('the read carries the timezone of the browser', async ({ page }) => {
  const fixture = await open(page, 3)

  const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  expect(zone).not.toBe('')
  // Read once: every answer is a line in the access log of each client evaluated.
  const reads = fixture.requests.filter((request) => request.path.endsWith('/today'))
  expect(reads.map((request) => new URLSearchParams(request.search).get('timezone'))).toEqual([
    zone,
  ])
})

test('the panels share a line on a wide display and stack on a phone', async ({ page }) => {
  await open(page, 3)

  const lefts = async (width: number) => {
    await page.setViewportSize({ width, height: 1080 })
    // The plot redraws to its new width; the panels are placed before it does.
    return page
      .locator('[data-today-indicator]')
      .evaluateAll((panels) =>
        panels.map((panel) => Math.round(panel.getBoundingClientRect().left)),
      )
  }

  expect(new Set(await lefts(1920)).size).toBe(3)
  expect(new Set(await lefts(MOBILE.width)).size).toBe(1)

  // Eight weeks of axis labels and a long name, on the narrowest phone.
  await page.setViewportSize({ width: 320, height: 700 })
  await expect(page.locator('[data-today-indicator="adherence"] svg').first()).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
