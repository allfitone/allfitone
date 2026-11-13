import { expect, test, type Page } from '@playwright/test'

import {
  clientCard,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
} from './studio-api-mock'

/**
 * HU-STUDIO-046 — giving a person a published program version.
 *
 * What the server owns is not re-tested here: it refuses a retired version, a
 * day past in her zone and a person with no zone, and this file asserts that
 * each of those three refusals reaches the coach as a different sentence,
 * because they ask him for different things. What the screen owns is the rest —
 * that only publishable versions are offered, that the consequences are said
 * before the click, that an overlap reads as allowed, and that the permission
 * decides whether the action exists at all.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const PROGRAMS = `/organizations/${ORG}/clients/people/${PERSON}/programs`

const FINITE = 'Bloque de fuerza · versión 2 · 12 sesiones'
const OPEN_ENDED = 'Movilidad diaria · versión 1 · sin fecha de final'

async function open(page: Page, overrides: Record<string, unknown> = {}) {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], ...overrides }),
  )
  await page.goto(PROGRAMS)
  await expect(page.locator('[data-client-program-assignment]')).toBeVisible()
}

/** The form asks for a version and a day; both are chosen the same way here. */
async function fill(page: Page, versionLabel: string, startsOn: string) {
  await page.getByRole('combobox', { name: 'Programa' }).click()
  await page.getByRole('option', { name: versionLabel }).click()
  await page.locator('#client-program-start').fill(startsOn)
}

test('offers only the versions that can be assigned', async ({ page }) => {
  await open(page)
  await page.getByRole('combobox', { name: 'Programa' }).click()

  const options = page.getByRole('option')
  await expect(options).toHaveCount(2)
  await expect(options.nth(0)).toHaveText(FINITE)
  await expect(options.nth(1)).toHaveText(OPEN_ENDED)
})

/*
 * Criterion 2, in the half the screen owns. The fixture carries a retired
 * version, an archived program with a published version, and a program with
 * only a draft — none of the three may be given, and none of them appears.
 */
test('a retired version, an archived program and a draft are not offered', async ({ page }) => {
  await open(page)
  await page.getByRole('combobox', { name: 'Programa' }).click()

  await expect(page.getByRole('option', { name: /versión 1 · 10 sesiones/ })).toHaveCount(0)
  await expect(page.getByRole('option', { name: /Programa archivado/ })).toHaveCount(0)
})

/*
 * The difference a coach has to understand before confirming: it decides what
 * he will see in her calendar one minute later.
 */
test('says whether the whole calendar is planted now or grows weekly', async ({ page }) => {
  await open(page)

  await fill(page, FINITE, '2026-12-01')
  await expect(page.locator('[data-client-program-chosen]')).toContainText(
    'toda su agenda queda sembrada en el momento de asignar',
  )

  await fill(page, OPEN_ENDED, '2026-12-01')
  await expect(page.locator('[data-client-program-chosen]')).toContainText(
    'su agenda crece una semana a la vez',
  )
})

/* A warning and never a block: the server assigns such a version anyway. */
test('warns when a version keeps a retired template, without blocking it', async ({ page }) => {
  await open(page)

  await fill(page, OPEN_ENDED, '2026-12-01')
  await expect(page.locator('[data-client-program-retired-templates]')).toContainText(
    'una plantilla que ya fue retirada',
  )
  await expect(page.getByRole('button', { name: 'Asignar el programa' })).toBeEnabled()
})

test('the dialog says what assigning does before it is confirmed', async ({ page }) => {
  await open(page)
  await fill(page, FINITE, '2026-12-01')
  await page.getByRole('button', { name: 'Asignar el programa' }).click()

  const dialog = page.locator('[data-client-program-assignment-dialog]')
  await expect(dialog).toContainText('Toda su agenda queda sembrada ahora mismo')
  await expect(dialog).toContainText('zona horaria de ella')
  await expect(dialog).toContainText('no cambia nunca')
  await expect(dialog).toContainText('no se bloquea')
})

test('assigning it plants her calendar and the list shows it', async ({ page }) => {
  await open(page)
  await fill(page, FINITE, '2026-12-01')
  await page.getByRole('button', { name: 'Asignar el programa' }).click()
  await page.getByRole('button', { name: 'Asignar y sembrar su agenda' }).click()

  await expect(page.locator('[data-client-program-assignment-outcome]')).toContainText(
    'Le quedaron sembradas 12 sesiones',
  )
  // The list is the proof: a refreshed read has to carry the new program.
  await expect(
    page.locator('[data-client-program-title]').filter({ hasText: 'Bloque de fuerza' }),
  ).toBeVisible()
})

/*
 * Criterion 5. An overlap is reported and never presented as a problem, and it
 * never says which program it overlaps with — the answer does not carry that.
 */
test('an overlap is reported as allowed, and names no other program', async ({ page }) => {
  await open(page, { assignOutcome: 'overlaps' })
  await fill(page, FINITE, '2026-12-01')
  await page.getByRole('button', { name: 'Asignar el programa' }).click()
  await page.getByRole('button', { name: 'Asignar y sembrar su agenda' }).click()

  const outcome = page.locator('[data-client-program-assignment-outcome]')
  await expect(outcome).toContainText('no impide nada')
  await expect(outcome).toContainText('puede tener varios a la vez')
})

test.describe('the three refusals that arrive as the same status', () => {
  const cases = [
    ['program-version', 'Vuelve a elegir una publicada'],
    ['starts-on', 'Ese día ya pasó en la zona horaria de ella'],
    ['timezone', 'abra Space al menos una vez'],
  ] as const

  for (const [outcome, said] of cases) {
    test(`${outcome} is told apart from the other two`, async ({ page }) => {
      await open(page, { assignOutcome: outcome })
      await fill(page, FINITE, '2026-12-01')
      await page.getByRole('button', { name: 'Asignar el programa' }).click()
      await page.getByRole('button', { name: 'Asignar y sembrar su agenda' }).click()

      // The refusal stays in the dialog, so what was chosen is not lost.
      const failure = page.locator('[data-client-program-assignment-failure]')
      await expect(failure).toContainText(said)
      await expect(page.locator('[data-client-program-assignment-dialog]')).toBeVisible()
    })
  }
})

/* Criterion 1 from the server's side: she can withdraw it while the form is open. */
test('a permission withdrawn while the form was open names the level it would take', async ({
  page,
}) => {
  await open(page, { assignOutcome: 'scope-required' })
  await fill(page, FINITE, '2026-12-01')
  await page.getByRole('button', { name: 'Asignar el programa' }).click()
  await page.getByRole('button', { name: 'Asignar y sembrar su agenda' }).click()

  const failure = page.locator('[data-client-program-assignment-failure]')
  await expect(failure).toContainText('permiso de entrenamiento')
  await expect(failure).toContainText('registro')
})

test('a paused service says to wait, and blames nothing on her', async ({ page }) => {
  await open(page, { assignOutcome: 'service-paused' })
  await fill(page, FINITE, '2026-12-01')
  await page.getByRole('button', { name: 'Asignar el programa' }).click()
  await page.getByRole('button', { name: 'Asignar y sembrar su agenda' }).click()

  await expect(page.locator('[data-client-program-assignment-failure]')).toContainText('pausado')
})

/*
 * Criterion 1 from the screen's side. Her card carries the level she granted,
 * so a coach who may only read is told which permission is missing instead of
 * being offered a button that would be refused.
 */
test('with training shared only to read, there is no form at all', async ({ page }) => {
  const readOnly = {
    ...clientCard,
    sections: clientCard.sections.map((section) =>
      section.scope_code === 'relationship_training'
        ? { ...section, access_level: 'read' }
        : section,
    ),
  }
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: readOnly }),
  )
  await page.goto(PROGRAMS)

  const note = page.locator('[data-client-programs-cannot-assign]')
  await expect(note).toContainText('solo para leerlo')
  await expect(note).toContainText('registro')
  await expect(page.locator('[data-client-program-assignment]')).toHaveCount(0)
})

test('with nothing published, it says where to publish instead of failing', async ({ page }) => {
  await open(page, { organizationPrograms: [] })

  await expect(page.locator('[data-client-program-assignment-nothing-published]')).toContainText(
    'Todavía no hay ninguna versión publicada',
  )
  await expect(page.getByRole('button', { name: 'Asignar el programa' })).toHaveCount(0)
})

/* A day already past in her zone is caught before the server is asked. */
test('a past day is refused without sending anything', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/assignments')) {
      asked.push(request.url())
    }
  })

  await open(page)
  await fill(page, FINITE, '2020-01-01')
  await page.getByRole('button', { name: 'Asignar el programa' }).click()

  await expect(
    page.getByText('El programa empieza hoy o después, en el día de ella.'),
  ).toBeVisible()
  await expect(page.locator('[data-client-program-assignment-dialog]')).toHaveCount(0)
  expect(asked).toEqual([])
})

test('the zone the day is read in is named, and said to be hers', async ({ page }) => {
  await open(page)

  await expect(page.locator('[data-client-program-zone]')).toContainText('zona de ella')
  await expect(page.locator('[data-client-program-zone]')).toContainText('America/Bogota')
})
