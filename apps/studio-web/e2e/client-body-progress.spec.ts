import { expect, test, type Page } from '@playwright/test'

import {
  bodySharingClientCard,
  clientBodyProgress,
  clientCard,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
  type StudioApiFixture,
} from './studio-api-mock'

/**
 * HU-STUDIO-052 — the measurements and photos a client shares with her coach.
 *
 * Two reads and one screen. What this suite guards most is the half that is
 * about the photos: each one is an access she reads, so none is asked for until
 * somebody opens it, and none leaves a link behind.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const CARD = `/organizations/${ORG}/clients/people/${PERSON}`
const BODY = `${CARD}/body-progress`

async function open(page: Page, overrides: Partial<StudioApiFixture> = {}) {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], ...overrides }),
  )
  await page.goto(BODY)
}

/** Every request for one photo's bytes, as the API would see them. */
function photoRequests(page: Page): string[] {
  const asked: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/studio/v1/') && pathname.endsWith('/content')) asked.push(pathname)
  })
  return asked
}

test('shows her measurements by day, in words and in their units', async ({ page }) => {
  await open(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Progreso corporal' })).toBeVisible()
  const days = page.locator('[data-client-body-day-name]')
  await expect(days).toHaveText([
    '14 de septiembre de 2026',
    '1 de agosto de 2026',
    '20 de junio de 2026',
  ])
  const newest = page.locator('[data-client-body-day]').first()
  await expect(newest).toContainText('Peso')
  // Kept in kilograms, and what she typed is said beside it.
  await expect(newest).toContainText('72,5 kg (registró 159,8 lb)')
  await expect(newest).toContainText('Cintura')
  await expect(page.getByText('Grasa corporal')).toBeVisible()
  await expect(page.getByText('24 %')).toBeVisible()
  await expect(page.getByText(/body_weight|body_fat|percent/)).toHaveCount(0)
})

/*
 * Criterion 1: training does not grant this. The screen says so before it is
 * read, and without the body permission it shows nothing — not even blank.
 */
test('without the body permission it shows nothing, and says what is missing', async ({ page }) => {
  await open(page, { clientBodyProgress: null })

  await expect(page.getByText('No te autorizó su progreso corporal')).toBeVisible()
  await expect(page.getByText(/aparte del de entrenamiento/)).toBeVisible()
  await expect(page.locator('[data-client-body-day]')).toHaveCount(0)
  await expect(page.locator('[data-client-body-photo]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
})

/*
 * Criterion 2: only the photos she chose to show this gym, said as such. Each is
 * a day and when she showed it; the list is all there is of her gallery here.
 */
test('lists only the photos she chose to show, by day and by when she showed them', async ({
  page,
}) => {
  await open(page)

  const photos = page.locator('[data-client-body-photo]')
  await expect(photos).toHaveCount(2)
  await expect(photos.first()).toContainText('Foto del 14 de septiembre de 2026')
  await expect(photos.first()).toContainText('Te la mostró el 20 de septiembre de 2026')
  await expect(page.getByText(/Solo las que eligió mostrarle a este gimnasio/)).toBeVisible()
})

/*
 * The rule this screen is built around. Opening the screen asks for no image;
 * opening a photo asks for that one; a repaint does not ask again; another
 * photo replaces the first rather than joining it.
 */
test('asks for a photo only when it is opened, one at a time', async ({ page }) => {
  const asked = photoRequests(page)
  await open(page)
  await expect(page.locator('[data-client-body-photo]')).toHaveCount(2)
  expect(asked).toEqual([])

  await page.getByRole('button', { name: 'Ver la foto' }).first().click()
  const image = page.getByRole('img', { name: 'Foto del 14 de septiembre de 2026' })
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

  await page.getByRole('button', { name: 'Ver la foto' }).click()
  await expect(page.getByRole('img', { name: 'Foto del 20 de junio de 2026' })).toBeVisible()
  await expect(page.locator('[data-authorized-photo-image]')).toHaveCount(1)
  expect(asked).toHaveLength(2)
})

/*
 * Criterion 4 is met by having no link at all. The image is drawn from bytes
 * held in this tab, and closing it releases them: nothing on the page points at
 * the API or at a store, and nothing is left to copy and open later.
 */
test('leaves no link to the photo, and forgets it when closed', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Ver la foto' }).first().click()

  const image = page.locator('[data-authorized-photo-image]')
  await expect(image).toBeVisible()
  const source = (await image.getAttribute('src')) ?? ''
  expect(source).toMatch(/^blob:/)
  await expect(page.locator('a[href*="body-photos"], img[src*="body-photos"]')).toHaveCount(0)

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
 * A photo that is gone, a revoked permission, an ended relationship and an
 * expired credential are one 404. One sentence for the four, and no retry.
 */
test('a photo it cannot show says one thing, whatever the reason', async ({ page }) => {
  await open(page, { bodyPhotoOutcome: 'unavailable' })
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
test('a failed connection is tried again only when asked', async ({ page }) => {
  const asked = photoRequests(page)
  await open(page, { bodyPhotoOutcome: 'failure' })
  await page.getByRole('button', { name: 'Ver la foto' }).first().click()

  await expect(page.getByText('No pudimos cargar la foto')).toBeVisible()
  expect(asked).toHaveLength(1)
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByText('No pudimos cargar la foto')).toBeVisible()
  expect(asked).toHaveLength(2)
})

/*
 * A version without photos sends an empty list: the measurements are drawn and
 * the photos section is not, rather than an empty box that says she has none.
 */
test('with no photos shown, there is no photos section at all', async ({ page }) => {
  await open(page, { clientBodyPhotos: [] })

  await expect(page.locator('[data-client-body-day]')).toHaveCount(3)
  await expect(page.locator('[data-client-body-photos]')).toHaveCount(0)
})

/*
 * A measurement whose value the version withholds is not a name beside a blank,
 * and a day left with nothing is not drawn.
 */
test('a measurement whose value did not travel is left out, never filled in', async ({ page }) => {
  const withheld = clientBodyProgress.map((record) =>
    record.measured_on === '2026-06-20'
      ? { ...record, value: null, unit_code: null, original_value: null, original_unit_code: null }
      : record,
  )
  await open(page, { clientBodyProgress: withheld })

  await expect(page.locator('[data-client-body-day]')).toHaveCount(2)
  await expect(page.getByText('Estatura')).toHaveCount(0)
  await expect(page.getByText(/sin registrar|sin dato|no disponible/i)).toHaveCount(0)
})

test('sharing the category and nothing in it is a state, not a failure', async ({ page }) => {
  await open(page, { clientBodyProgress: [], clientBodyPhotos: [] })

  await expect(page.getByText('No hay nada de su progreso corporal')).toBeVisible()
})

test('a person the caller does not attend has no body progress to open', async ({ page }) => {
  await open(page, { clientCard: null })

  await expect(page.getByText('No encontramos este progreso corporal')).toBeVisible()
})

/*
 * Both reads are asked once on arrival and never again on their own: returning
 * to the window would otherwise write her two accesses nobody asked for.
 */
test('asks for each list once on arrival and never again on its own', async ({ page }) => {
  const reads: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (/\/body-(progress|photos)$/.test(pathname) && pathname.startsWith('/studio/v1/')) {
      reads.push(pathname)
    }
  })
  await open(page)
  await expect(page.locator('[data-client-body-photo]')).toHaveCount(2)
  expect(reads).toHaveLength(2)

  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('[data-client-body-photo]')).toHaveCount(2)
  expect(reads).toHaveLength(2)
})

/*
 * The category names two reads and the card offers one door to both. No second
 * button for the photos: they are part of this screen, not a place to go.
 */
test('is opened from the body section of the card, by one door', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: bodySharingClientCard }),
  )
  await page.goto(CARD)
  await expect(page.getByRole('heading', { name: 'Progreso corporal' })).toBeVisible()

  await expect(
    page.locator('[data-client-card-door="listAuthorizedClientBodyPhotos"]'),
  ).toHaveCount(0)
  const door = page.locator('[data-client-card-door="listAuthorizedClientBodyProgress"]')
  await expect(door).toHaveCount(1)

  await door.click()
  await expect(page).toHaveURL(new RegExp(`${PERSON}/body-progress$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Progreso corporal' })).toBeVisible()
})
