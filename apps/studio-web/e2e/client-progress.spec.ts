import { expect, test } from '@playwright/test'

import {
  clientCard,
  createStudioApiFixture,
  emptyClientProgress,
  holderMembership,
  installStudioApiMock,
} from './studio-api-mock'

/**
 * HU-STUDIO-056 — how a client's training is going, from what she shares.
 *
 * Every figure is the server's: computed when it is read, from the sessions this
 * coach may see and no others. So what is checked here is the half the screen
 * owns, and it is almost entirely about refusing to round — a figure the server
 * could not compute must read as absent, never as a zero.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const CARD = `/organizations/${ORG}/clients/people/${PERSON}`
const PROGRESS = `${CARD}/progress`

test.beforeEach(async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
})

test('shows her weeks oldest first, with what she did in each', async ({ page }) => {
  await page.goto(PROGRESS)

  await expect(page.getByRole('heading', { level: 1, name: 'Progreso' })).toBeVisible()
  const rows = page.locator('[data-client-progress-period]')
  await expect(rows).toHaveCount(4)
  // A progression reads forward in time, so the oldest week is the first row.
  await expect(rows.first()).toContainText('7 – 13 sept')
  await expect(rows.first()).toContainText('1 h 30 min')
  await expect(rows.first()).toContainText('3.120 kg')
})

/*
 * A period carries all six of its figures, and the movements stay a table.
 *
 * Written after the fact, twice over. The card styling for a narrow screen
 * carried the same attribute as a table row, so `display: grid` landed on a
 * `<tr>` and stood every cell on its own line — which a person spotted at a
 * glance and the sweep could not, because it measures overflow and not whether
 * a table reads as one. Fixing that revealed the second half: six figures ask
 * for more than a Studio screen's 1024px, so the periods are blocks now. The
 * movements are four narrow columns and do fit, which they only do because each
 * register owns its own measurement.
 */
test('a period carries its figures, and the movements stay a table', async ({ page }) => {
  await page.goto(PROGRESS)
  await expect(page.locator('[data-client-progress-period]')).toHaveCount(4)

  const first = page.locator('[data-client-progress-period]').first()
  for (const label of ['Sesiones', 'Tiempo', 'Series de trabajo', 'Volumen', 'Dónde cayeron']) {
    await expect(first).toContainText(label)
  }

  await expect(page.locator('[data-studio-register="client-progress-movements"]')).toBeVisible()
})

/*
 * Criterion 2, and the single most important assertion on this screen. The
 * second week was all bodyweight work, so the server computed no volume for it.
 * A zero there would say she lifted nothing in a week she trained three times.
 */
test('a week with nothing weighed has no volume, not a zero', async ({ page }) => {
  await page.goto(PROGRESS)

  const bodyweight = page.locator('[data-client-progress-period]').nth(1)
  await expect(bodyweight).toContainText('14 – 20 sept')
  await expect(bodyweight).toContainText('Sin peso registrado')
  await expect(bodyweight.locator('[data-client-progress-volume]')).not.toContainText('0 kg')
  // And the panel says why once, so no cell has to explain itself.
  await expect(page.getByText('no tiene volumen, y no es cero')).toBeVisible()
})

/*
 * The operation answers `order by best_kg desc, name nulls last, movement_id`,
 * and the screen draws that order without touching it: a list sorted again here
 * would disagree with the one the person sees in Space.
 */
test('reads heaviest first, in the order the server answered', async ({ page }) => {
  await page.goto(PROGRESS)

  const names = page.locator('[data-client-progress-movement-name]')
  await expect(names).toHaveText([
    'Sentadilla trasera',
    'Sentadilla búlgara con mancuernas y pausa de tres segundos abajo',
    'Press de banca',
    'Un movimiento que solo ella nombra',
    'Plancha con lastre',
  ])
})

/*
 * A name has no length limit in the database, so no column share can always
 * hold one. The long name takes a second line; it does not run into the figure
 * beside it, which is what it did when the four columns were even quarters and
 * the cell carried the table's `nowrap`.
 */
test('a name longer than its column wraps instead of leaving it', async ({ page }) => {
  await page.goto(PROGRESS)

  const long = page
    .locator('[data-client-progress-movement-name]')
    .filter({ hasText: 'pausa de tres segundos' })
  await expect(long).toBeVisible()

  const measured = await long.evaluate((name) => {
    const cell = name.closest('td')
    if (!cell) return { lines: 0, past: 0 }
    const range = document.createRange()
    range.selectNodeContents(name)
    return {
      lines: name.getClientRects().length,
      past: Math.round(range.getBoundingClientRect().right - cell.getBoundingClientRect().right),
    }
  })
  expect(measured.lines).toBeGreaterThan(1)
  expect(measured.past).toBeLessThanOrEqual(0)
})

/*
 * Criterion 4. A movement only she can name was counted, so its row stays —
 * dropping it would change the figures, and naming it would read something she
 * did not share.
 */
test('a movement only she can name keeps its row, without a name', async ({ page }) => {
  await page.goto(PROGRESS)

  const unnamed = page.locator('[data-client-progress-movement-name][data-unnamed]')
  await expect(unnamed).toHaveCount(1)
  await expect(unnamed).toContainText('solo ella nombra')
})

test('says nothing it could not compute about a movement', async ({ page }) => {
  await page.goto(PROGRESS)

  const first = page
    .locator('[data-client-progress-movement]')
    .filter({ hasText: 'Plancha con lastre' })
  // First period it appears in: no earlier best, so no change and no «+0 kg».
  await expect(first).toBeVisible()
  await expect(first).not.toContainText('+0')
  // No set in the formula's range, so no estimate rather than a rounded one.
  await expect(first).not.toContainText('kg estimado')

  const down = page.locator('[data-client-progress-movement]').filter({ hasText: 'Press de banca' })
  await expect(down).toContainText('−5 kg')
})

/*
 * The screen computes nothing of its own: every number on it is one the server
 * produced from data this coach may read. A total across periods would be a
 * figure nobody authorized.
 */
test('adds nothing up of its own', async ({ page }) => {
  await page.goto(PROGRESS)
  await expect(page.locator('[data-client-progress-period]')).toHaveCount(4)

  await expect(page.getByText(/\bTotal\b|\bEn total\b|\bPromedio\b/)).toHaveCount(0)
  // Nor a count of the muscles it did not name: it says how many are left.
  await expect(page.getByText('y 2 más')).toBeVisible()
})

/*
 * The zone decides where a week starts, so the screen names the one it asked
 * in. Which one that is belongs to the machine: this read the zone from
 * wherever it ran, passed on a laptop in Bogotá and failed on a runner in UTC.
 * Pinned here rather than inherited, the way the substitution suite pins it.
 */
test.describe('read from Bogotá', () => {
  test.use({ timezoneId: 'America/Bogota' })

  test('says in which zone the periods were drawn', async ({ page }) => {
    await page.goto(PROGRESS)
    await expect(page.getByText('Las semanas se calculan en la zona America/Bogota.')).toBeVisible()

    // And the month view says it of months, with the article months take.
    await page.getByRole('button', { name: 'Por mes' }).click()
    await expect(page.getByText('Los meses se calculan en la zona America/Bogota.')).toBeVisible()
  })
})

test('the month view is a different question, and asks the server again', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/studio/v1/') && url.pathname.endsWith('/progress')) {
      asked.push(url.searchParams.get('period') ?? '')
    }
  })

  await page.goto(PROGRESS)
  await expect(page.getByRole('heading', { name: 'Semana a semana' })).toBeVisible()
  expect(asked).toEqual(['week'])

  await page.getByRole('button', { name: 'Por mes' }).click()
  await expect(page.getByRole('heading', { name: 'Mes a mes' })).toBeVisible()
  expect(asked).toEqual(['week', 'month'])
})

/*
 * Each answer is a read recorded for her to see, so the screen asks on arrival
 * and when the period changes — never because a window regained focus.
 */
test('asks once and never again on its own', async ({ page }) => {
  const reads: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/studio/v1/') && pathname.endsWith('/progress')) reads.push(pathname)
  })

  await page.goto(PROGRESS)
  await expect(page.locator('[data-client-progress-period]')).toHaveCount(4)
  expect(reads).toHaveLength(1)

  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('[data-client-progress-period]')).toHaveCount(4)
  expect(reads).toHaveLength(1)
})

/*
 * Twelve rows of zeros read as a broken screen, so a window with no training is
 * said once — and both readings are offered, because from here they cannot be
 * told apart.
 */
test('a window with no training says so once, and does not blame her', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientProgress: emptyClientProgress,
    }),
  )
  await page.goto(PROGRESS)

  await expect(page.getByText('No hay nada que medir en las últimas doce semanas')).toBeVisible()
  await expect(page.getByText('no haya entrenado en ese tiempo')).toBeVisible()
  await expect(page.getByText('no se puede distinguir')).toBeVisible()
  await expect(page.locator('[data-client-progress-period]')).toHaveCount(0)
})

/*
 * Criterion 1 at its hardest edge: with neither category shared there is nothing
 * a figure could be computed from, so the operation refuses rather than
 * answering a window of zeros.
 */
test('without either permission it refuses, and does not answer zeros', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientProgress: null }),
  )
  await page.goto(PROGRESS)

  await expect(page.getByText('No te autorizó nada con lo que medir su progreso')).toBeVisible()
  await expect(page.getByText('ni en cero')).toBeVisible()
  await expect(page.getByText('El intento queda registrado')).toBeVisible()
  await expect(page.locator('[data-client-progress-period]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ver su ficha' })).toBeVisible()
})

test('a person the caller does not attend has no progress to open', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: null }),
  )
  await page.goto(PROGRESS)

  await expect(page.getByText('No encontramos este progreso')).toBeVisible()
})

/*
 * The card is the way in, and the progress operation is named by both categories
 * — so, like the sessions, its door is offered once.
 */
test('is opened from the card, once, however many categories feed it', async ({ page }) => {
  await page.goto(CARD)
  await expect(page.getByRole('heading', { name: 'Entrenamiento con nosotros' })).toBeVisible()

  const doors = page.locator('[data-client-card-door="getAuthorizedClientProgress"]')
  await expect(doors).toHaveCount(1)

  await doors.click()
  await expect(page).toHaveURL(new RegExp(`${PERSON}/progress$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Progreso' })).toBeVisible()

  await page.getByRole('link', { name: 'Volver a su ficha' }).click()
  await expect(page).toHaveURL(new RegExp(`people/${PERSON}$`))
})
