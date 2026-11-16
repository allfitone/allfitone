import { expect, test, type Page } from '@playwright/test'

import {
  NUTRITION_TODAY,
  clientCard,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
  narrowNutritionMeals,
  nutritionSharingClientCard,
  type StudioApiFixture,
} from './studio-api-mock'

/**
 * HU-STUDIO-068 — the meals a client shares with the coach who attends her.
 *
 * The clock is pinned to 29 July, so the last seven days are 23 to 29 July and
 * the meal on the 10th is outside them until somebody asks for it. What this
 * suite guards most is that every read is one somebody asked for: typing a date
 * reads nothing, and a return to the window reads nothing either.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const CARD = `/organizations/${ORG}/clients/people/${PERSON}`
const NUTRITION = `${CARD}/nutrition`

async function open(page: Page, overrides: Partial<StudioApiFixture> = {}) {
  await page.clock.setFixedTime(new Date(NUTRITION_TODAY))
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], ...overrides }),
  )
  await page.goto(NUTRITION)
}

/** Every read of one of her nutrition lists, with the days it asked for. */
function readsOf(page: Page, list: 'meals' | 'daily-summaries'): string[] {
  const asked: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/studio/v1/') && url.pathname.endsWith(`/nutrition/${list}`)) {
      asked.push(`${url.searchParams.get('from')}..${url.searchParams.get('to')}`)
    }
  })
  return asked
}

function mealReads(page: Page): string[] {
  return readsOf(page, 'meals')
}

test('shows her last seven days of meals, by her day, with what she ate', async ({ page }) => {
  const asked = mealReads(page)
  await open(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Comidas' })).toBeVisible()
  await expect(page.locator('[data-client-nutrition-day-name]')).toHaveText([
    'Martes, 28 de julio de 2026',
    'Lunes, 27 de julio de 2026',
  ])
  expect(asked).toEqual(['2026-07-23..2026-07-29'])
  await expect(page.getByLabel('Desde')).toHaveValue('2026-07-23')
  await expect(page.getByLabel('Hasta')).toHaveValue('2026-07-29')

  const dinner = page.locator('[data-client-nutrition-meal]').first()
  await expect(dinner.locator('[data-client-nutrition-meal-title]')).toHaveText('Cena')
  // 00:45 in UTC on the 29th is 7:45 p.m. of her 28th, and it stays on her 28th.
  await expect(dinner.locator('[data-client-nutrition-meal-time]')).toHaveText(/^7:45\sp\.\sm\.$/)
  await expect(dinner).toContainText('Salmón con verduras · 1 plato (280 g)')
  await expect(dinner).toContainText('Energía 460 kcal · Proteína 38 g · Grasa 22 g')

  const lunch = page.locator('[data-client-nutrition-meal]').nth(1)
  await expect(lunch).toContainText('Con prisa, entre dos reuniones')
  await expect(lunch).toContainText('Pollo con arroz · 320 g')
  await expect(lunch).toContainText('Jugo de naranja · 1 vaso (240 g)')
  await expect(page.getByText('Arepa con queso')).toHaveCount(0)
  await expect(page.getByText(/dinner|lunch|carbohydrates|kcal_/)).toHaveCount(0)
})

/*
 * Criterion 1: without the meals permission nothing of hers is shown, not even
 * blank, and no retry is offered: pressing it would refuse again, recorded.
 */
test('without the meals permission it shows nothing, and says what is missing', async ({
  page,
}) => {
  await open(page, { clientNutritionMeals: null })

  await expect(page.getByText('No te autorizó su registro de comidas')).toBeVisible()
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(0)
  // Criterion 4 of the totals: with the permission gone, they go too.
  await expect(page.locator('[data-client-nutrition-summary]')).toHaveCount(0)
  await expect(page.locator('[data-client-nutrition-range]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
})

/*
 * Criteria 4 and 7: the owner and admins read it as anybody who does not attend
 * her does — the same 404, which says nothing about whether she has meals.
 */
test('a caller who does not attend her, owner or admin included, finds nothing', async ({
  page,
}) => {
  await open(page, { clientCard: null })

  await expect(page.getByText('No encontramos este registro de comidas')).toBeVisible()
  await expect(page.getByText(/ni siquiera el propietario o un administrador/)).toBeVisible()
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(0)
})

/*
 * Criterion 2: a photo needs a second permission. With it, a meal says whether it
 * has one; without it, `has_photo` is null and nothing is drawn where the mark
 * would go — never «Sin foto», which would claim the meal had none.
 */
test('with her meal photos shared, a meal says whether it has one', async ({ page }) => {
  await open(page)
  const meals = page.locator('[data-client-nutrition-meal]')
  await expect(meals).toHaveCount(4)
  await expect(meals.nth(0).getByRole('button', { name: 'Ver la foto' })).toBeVisible()
  await expect(meals.nth(1).locator('[data-client-nutrition-meal-photo]')).toHaveText('Sin foto')
  await expect(meals.nth(1).getByRole('button', { name: 'Ver la foto' })).toHaveCount(0)
})

test('without her meal photos shared, no meal says anything about a photo', async ({ page }) => {
  await open(page, { nutritionPhotoScope: null })

  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(4)
  await expect(page.locator('[data-client-nutrition-meal-photo]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ver la foto' })).toHaveCount(0)
  await expect(page.getByText(/Sin foto|Con foto|Cada foto se pide/)).toHaveCount(0)
})

/*
 * Another range is another read, so it is asked for by pressing, not by typing.
 * Her Space plan's window does not narrow it: the 10th is read like any day.
 */
test('reads another range only when somebody presses to ask for it', async ({ page }) => {
  const asked = mealReads(page)
  await open(page)
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(4)

  await page.getByLabel('Desde').fill('2026-07-01')
  await page.getByLabel('Hasta').fill('2026-07-15')
  expect(asked).toEqual(['2026-07-23..2026-07-29'])

  await page.getByRole('button', { name: 'Consultar' }).click()
  await expect(page.locator('[data-client-nutrition-day-name]')).toHaveText([
    'Viernes, 10 de julio de 2026',
  ])
  await expect(page.getByText('Otra comida')).toBeVisible()
  await expect(page.getByText('Arepa con queso · 150 g')).toBeVisible()
  expect(asked).toEqual(['2026-07-23..2026-07-29', '2026-07-01..2026-07-15'])
})

/*
 * Criterion 2 of the summaries holds here too: thirty-one days at most. The form
 * says so before anything is read, rather than sending a range the API refuses.
 */
test('refuses a range longer than thirty-one days, or one that ends first, before reading', async ({
  page,
}) => {
  const asked = mealReads(page)
  await open(page)
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(4)

  await page.getByLabel('Desde').fill('2026-06-01')
  await page.getByRole('button', { name: 'Consultar' }).click()
  await expect(page.getByText('Puedes consultar hasta 31 días seguidos.')).toBeVisible()

  await page.getByLabel('Desde').fill('2026-07-29')
  await page.getByLabel('Hasta').fill('2026-07-20')
  await page.getByRole('button', { name: 'Consultar' }).click()
  await expect(page.getByText('«Hasta» no puede ir antes de «Desde».')).toBeVisible()

  expect(asked).toEqual(['2026-07-23..2026-07-29'])
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(4)
})

/*
 * A version that shares the day and the foods' names only. Each meal is drawn
 * with what travelled — a plain «Comida», no hour, a name — and nothing is
 * described as missing.
 */
test('a version that withholds fields draws what travelled, and fills in nothing', async ({
  page,
}) => {
  await open(page, { clientNutritionMeals: narrowNutritionMeals })

  const meals = page.locator('[data-client-nutrition-meal]')
  await expect(meals).toHaveCount(4)
  await expect(page.locator('[data-client-nutrition-meal-title]')).toHaveText([
    'Comida',
    'Comida',
    'Comida',
    'Comida',
  ])
  await expect(page.locator('[data-client-nutrition-meal-time]')).toHaveCount(0)
  await expect(page.locator('[data-client-nutrition-meal-note]')).toHaveCount(0)
  await expect(page.locator('[data-client-nutrition-item-nutrients]')).toHaveCount(0)
  await expect(meals.first().locator('[data-client-nutrition-item-line]')).toHaveText(
    'Salmón con verduras',
  )
  await expect(page.getByText(/sin registrar|sin dato|no disponible|0 kcal/i)).toHaveCount(0)
})

test('days with nothing to show are a state, not a failure', async ({ page }) => {
  await open(page, { clientNutritionMeals: [] })

  await expect(page.getByText('No hay comidas suyas que podamos mostrarte')).toBeVisible()
  await expect(page.getByText(/no se puede distinguir/)).toBeVisible()
  // The range stays, so another one can be asked for.
  await expect(page.getByRole('button', { name: 'Consultar' })).toBeVisible()
})

test('a dropped connection is retried when somebody asks', async ({ page }) => {
  // Studio retries a 503 once on its own; the button appears after that one.
  let failures = 2
  await open(page, {
    intercept: (request) => {
      if (!request.path.endsWith('/nutrition/meals') || failures === 0) return undefined
      failures -= 1
      return { status: 503, body: { error: { code: 'upstream-unavailable' } } }
    },
  })

  await expect(page.getByText('No pudimos cargar sus comidas')).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(4)
})

/*
 * Criterion 5: no cache stands between a revoked permission and the next read,
 * and nothing reads again on its own — a return to the window would otherwise
 * write her an access nobody asked for.
 */
test('asks once on arrival and never again on its own', async ({ page }) => {
  const asked = mealReads(page)
  const added = readsOf(page, 'daily-summaries')
  await open(page)
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(4)

  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(4)
  expect(asked).toHaveLength(1)
  expect(added).toHaveLength(1)
})

// --- HU-STUDIO-069 · her days, added up ---

test('adds up each of her days above her meals, newest first, energy first', async ({ page }) => {
  await open(page)

  const summary = page.locator('[data-client-nutrition-summary]')
  await expect(summary.getByRole('heading', { name: 'Por día' })).toBeVisible()
  // Seven days were read; only the two with a meal are drawn.
  await expect(page.locator('[data-client-nutrition-summary-day-name]')).toHaveText([
    'Martes, 28 de julio de 2026',
    'Lunes, 27 de julio de 2026',
  ])
  const busiest = page.locator('[data-client-nutrition-summary-day]').first()
  await expect(busiest.locator('[data-client-nutrition-summary-meals]')).toHaveText('3 comidas')
  await expect(busiest.locator('dt')).toHaveText(['Energía', 'Proteína', 'Carbohidratos', 'Grasa'])
  await expect(busiest.locator('dd')).toHaveText(['1.580 kcal', '80 g', '70 g', '22 g'])
  await expect(
    page
      .locator('[data-client-nutrition-summary-day]')
      .nth(1)
      .locator('[data-client-nutrition-summary-meals]'),
  ).toHaveText('1 comida')

  const order = await page
    .locator('[data-client-nutrition-summary], [data-client-nutrition-meals]')
    .evaluateAll((cards) => cards.map((card) => card.hasAttribute('data-client-nutrition-summary')))
  expect(order).toEqual([true, false])
})

/*
 * A day with nothing comes with a zero count and no totals. Drawn, it would read
 * as «she did not eat»; a gap may be a day she did not record or one she keeps
 * to herself, so it is left out and the card says why once.
 */
test('a day with no meals is not drawn, and nothing is drawn as zero', async ({ page }) => {
  await open(page)

  await expect(page.locator('[data-client-nutrition-summary-day]')).toHaveCount(2)
  await expect(page.getByText(/(^|\s)0 (comidas|kcal|g)\b/)).toHaveCount(0)
  await expect(page.getByText(/uno que no registró o uno que prefirió no mostrar/)).toBeVisible()
})

/*
 * A version that shares no nutrients sends no totals, so a total never reveals
 * what it hides. The count of meals stays; no nutrient is drawn for the day.
 */
test('a version without nutrients keeps the count and draws no total', async ({ page }) => {
  await open(page, { nutritionTotalsShared: false })

  await expect(page.locator('[data-client-nutrition-summary-day]')).toHaveCount(2)
  await expect(page.locator('[data-client-nutrition-summary-meals]').first()).toHaveText(
    '3 comidas',
  )
  await expect(page.locator('[data-client-nutrition-totals]')).toHaveCount(0)
})

// Criterion 2: one range for both, so the totals always add up the meals below.
test('asks for her totals with the same days as her meals, and only when asked', async ({
  page,
}) => {
  const added = readsOf(page, 'daily-summaries')
  await open(page)
  await expect(page.locator('[data-client-nutrition-summary-day]')).toHaveCount(2)
  expect(added).toEqual(['2026-07-23..2026-07-29'])

  await page.getByLabel('Desde').fill('2026-07-01')
  await page.getByLabel('Hasta').fill('2026-07-15')
  expect(added).toHaveLength(1)
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.locator('[data-client-nutrition-summary-day-name]')).toHaveText([
    'Viernes, 10 de julio de 2026',
  ])
  expect(added).toEqual(['2026-07-23..2026-07-29', '2026-07-01..2026-07-15'])
})

test('totals that fail to load leave her meals, and are retried when asked', async ({ page }) => {
  // Studio retries a 503 once on its own; the button appears after that one.
  let failures = 2
  await open(page, {
    intercept: (request) => {
      if (!request.path.endsWith('/nutrition/daily-summaries') || failures === 0) return undefined
      failures -= 1
      return { status: 503, body: { error: { code: 'upstream-unavailable' } } }
    },
  })

  await expect(page.getByText('No pudimos sumar sus días')).toBeVisible()
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(4)
  await page
    .locator('[data-client-nutrition-summary]')
    .getByRole('button', { name: 'Reintentar' })
    .click()
  await expect(page.locator('[data-client-nutrition-summary-day]')).toHaveCount(2)
})

/*
 * The category names two reads and the card offers one door to both. The meal
 * photos are another category with no door: they open inside this screen.
 */
test('is opened from the meals section of the card, by one door', async ({ page }) => {
  await page.clock.setFixedTime(new Date(NUTRITION_TODAY))
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientCard: nutritionSharingClientCard,
    }),
  )
  await page.goto(CARD)

  await expect(
    page.locator('[data-client-card-door="listAuthorizedClientNutritionDailySummaries"]'),
  ).toHaveCount(0)
  await expect(
    page.locator('[data-client-card-door="getAuthorizedClientNutritionMealPhoto"]'),
  ).toHaveCount(0)
  const door = page.locator('[data-client-card-door="listAuthorizedClientNutritionMeals"]')
  await expect(door).toHaveCount(1)
  await expect(door).toHaveText('Ver sus comidas')

  await door.click()
  await expect(page).toHaveURL(new RegExp(`${PERSON}/nutrition$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Comidas' })).toBeVisible()
})

// --- HU-STUDIO-072 · the photo of a meal ---

/** Every request for one meal photo's bytes, as the API would see them. */
function mealPhotoReads(page: Page): string[] {
  const asked: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/studio/v1/') && /\/nutrition\/meals\/[^/]+\/photo$/.test(pathname)) {
      asked.push(pathname)
    }
  })
  return asked
}

/*
 * The rule the photo is built around. Opening the screen asks for no image;
 * opening a photo asks for that one; a repaint does not ask again; another photo
 * replaces the first rather than joining it.
 */
test('asks for a meal photo only when it is opened, one at a time', async ({ page }) => {
  const asked = mealPhotoReads(page)
  await open(page)
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(4)
  expect(asked).toEqual([])

  await page.getByRole('button', { name: 'Ver la foto' }).first().click()
  const image = page.getByRole('img', {
    name: 'Foto de la comida: Cena del martes, 28 de julio de 2026',
  })
  await expect(image).toBeVisible()
  // Decoded, not a broken icon.
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(120)
  expect(asked).toHaveLength(1)

  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(image).toBeVisible()
  expect(asked).toHaveLength(1)

  await page.getByRole('button', { name: 'Ver la foto' }).first().click()
  await expect(
    page.getByRole('img', { name: 'Foto de la comida: Desayuno del martes, 28 de julio de 2026' }),
  ).toBeVisible()
  await expect(page.locator('[data-authorized-photo-image]')).toHaveCount(1)
  expect(asked).toHaveLength(2)
})

/*
 * Criterion 4: each view is recorded on its own. Closing and opening the same
 * photo again is honestly a second view, so it is asked for again.
 */
test('opening the same photo again is another view, asked for again', async ({ page }) => {
  const asked = mealPhotoReads(page)
  await open(page)
  const dinner = page.locator('[data-client-nutrition-meal]').first()

  await dinner.getByRole('button', { name: 'Ver la foto' }).click()
  await expect(dinner.locator('[data-authorized-photo-image]')).toBeVisible()
  await dinner.getByRole('button', { name: 'Ocultar la foto' }).click()
  await expect(dinner.locator('[data-authorized-photo-image]')).toHaveCount(0)
  await dinner.getByRole('button', { name: 'Ver la foto' }).click()
  await expect(dinner.locator('[data-authorized-photo-image]')).toBeVisible()

  expect(asked).toHaveLength(2)
  expect(new Set(asked).size).toBe(1)
})

/*
 * Criterion 2 is met by having no link at all. The image is drawn from bytes
 * held in this tab, and closing it releases them: nothing on the page points at
 * the API or at a store, and nothing is left to open later.
 */
test('leaves no link to the meal photo, and forgets it when closed', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Ver la foto' }).first().click()

  const image = page.locator('[data-authorized-photo-image]')
  await expect(image).toBeVisible()
  const source = (await image.getAttribute('src')) ?? ''
  expect(source).toMatch(/^blob:/)
  await expect(page.locator('a[href*="/photo"], img[src*="/photo"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Ocultar la foto' }).click()
  await expect(image).toHaveCount(0)
  const stillThere = await page.evaluate(async (url) => {
    try {
      await fetch(url)
      return true
    } catch {
      return false
    }
  }, source)
  expect(stillThere).toBe(false)
})

/*
 * Criterion 5: a photo gone, a revoked permission, an ended relationship and an
 * expired credential are one 404. One sentence for the four, and no retry.
 */
test('a meal photo it cannot show says one thing, whatever the reason', async ({ page }) => {
  await open(page, { mealPhotoOutcome: 'unavailable' })
  await page.getByRole('button', { name: 'Ver la foto' }).first().click()

  await expect(page.getByText('No podemos mostrar esta foto')).toBeVisible()
  await expect(page.getByText('Desde aquí no se puede saber por qué.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  await expect(page.locator('[data-authorized-photo-image]')).toHaveCount(0)
})

/*
 * A dropped connection is retried only when somebody presses the button: each
 * attempt is a line in her log, so nothing tries again on its own.
 */
test('a meal photo that failed to load is tried again only when asked', async ({ page }) => {
  const asked = mealPhotoReads(page)
  await open(page, { mealPhotoOutcome: 'failure' })
  await page.getByRole('button', { name: 'Ver la foto' }).first().click()

  await expect(page.getByText('No pudimos cargar la foto')).toBeVisible()
  expect(asked).toHaveLength(1)
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByText('No pudimos cargar la foto')).toBeVisible()
  expect(asked).toHaveLength(2)
})

// Another range is another list: a photo open on the old one is closed, not kept.
test('asking for other days closes the photo that was open', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Ver la foto' }).first().click()
  await expect(page.locator('[data-authorized-photo-image]')).toBeVisible()

  await page.getByLabel('Desde').fill('2026-07-20')
  await page.getByRole('button', { name: 'Consultar' }).click()
  await expect(page.locator('[data-client-nutrition-meal]')).toHaveCount(4)
  await expect(page.locator('[data-authorized-photo-image]')).toHaveCount(0)
})
