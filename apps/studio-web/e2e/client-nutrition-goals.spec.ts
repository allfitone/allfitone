import { expect, test, type Page } from '@playwright/test'

import {
  clientCard,
  clientNutritionGoalVersions,
  createStudioApiFixture,
  foreignActiveNutritionGoal,
  goalSharingClientCard,
  holderMembership,
  installStudioApiMock,
  type StudioApiFixture,
} from './studio-api-mock'

/**
 * HU-STUDIO-070 — the goals this relationship proposed a client, and the one she
 * follows today.
 *
 * What this suite guards most is what the screen does not say: who set a goal
 * this relationship did not propose, the author of a proposal, or its number.
 * And every read is one somebody asked for, so a return reads again and nothing
 * reads on its own.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const CARD = `/organizations/${ORG}/clients/people/${PERSON}`
const GOALS = `${CARD}/nutrition-goals`

async function open(page: Page, overrides: Partial<StudioApiFixture> = {}) {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientCard: goalSharingClientCard,
      ...overrides,
    }),
  )
  await page.goto(GOALS)
}

/** Every read of her goals, with the cursor it asked for. */
function goalReads(page: Page): string[] {
  const asked: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname.endsWith('/nutrition/goals/versions')) {
      asked.push(url.searchParams.get('cursor') ?? 'first')
    }
  })
  return asked
}

test('shows what this relationship proposed her, and the goal she follows today', async ({
  page,
}) => {
  const asked = goalReads(page)
  await open(page)

  await expect(
    page.getByRole('heading', { level: 1, name: 'Objetivos nutricionales' }),
  ).toBeVisible()

  const today = page.locator('[data-client-nutrition-goals-active]')
  // In nutrient order, not the code order the API answers in.
  await expect(today.locator('[data-client-nutrition-goal-targets] li')).toHaveText([
    'Proteína: entre 110 y 130 g',
    'Fibra: al menos 25 g',
  ])
  await expect(today).toContainText('Lo sigue desde el ')
  await expect(today).toContainText('Es una propuesta de esta relación que ella aceptó.')

  const proposals = page.locator('[data-client-nutrition-goal]')
  await expect(proposals).toHaveCount(3)
  await expect(proposals.locator('[data-client-nutrition-goal-status]')).toHaveText([
    'Esperando su decisión',
    'Lo sigue hoy',
    'Rechazado',
  ])
  const waiting = proposals.first()
  await expect(waiting.locator('[data-client-nutrition-goal-targets] li')).toHaveText([
    'Energía: entre 2.100 y 2.400 kcal',
    'Proteína: al menos 140 g',
    'Agua: al menos 2.500 ml',
  ])
  await expect(waiting).toContainText('Para el bloque de fuerza')
  await expect(proposals.nth(2)).toContainText('Lo rechazó el ')
  expect(asked).toEqual(['first'])
})

test('nothing names the author of a proposal, nor counts her goals', async ({ page }) => {
  await open(page)
  await expect(page.locator('[data-client-nutrition-goal]')).toHaveCount(3)

  const author = clientNutritionGoalVersions[0]?.author.person_id ?? ''
  await expect(page.getByText(author)).toHaveCount(0)
  await expect(page.getByText(/versión \d|v\d\b|#\d/i)).toHaveCount(0)
})

test('an active goal this relationship did not propose says nothing of who set it', async ({
  page,
}) => {
  await open(page, {
    clientActiveNutritionGoal: foreignActiveNutritionGoal,
    clientNutritionGoals: clientNutritionGoalVersions.map((version) =>
      version.status === 'active' ? { ...version, status: 'superseded' } : version,
    ),
  })

  const today = page.locator('[data-client-nutrition-goals-active]')
  await expect(today.locator('[data-client-nutrition-goal-targets] li')).toHaveText([
    'Energía: hasta 2.000 kcal',
  ])
  await expect(today).not.toContainText('esta relación')
  await expect(today.getByRole('button')).toHaveCount(0)
  await expect(today.getByRole('link')).toHaveCount(0)
  await expect(page.locator('[data-client-nutrition-goal-status]').nth(1)).toHaveText('Reemplazado')
})

test('criterion 1: without her guidance shared, nothing of hers and no retry', async ({ page }) => {
  const asked = goalReads(page)
  await open(page, { clientNutritionGoals: null })

  await expect(page.locator('[data-client-nutrition-goals-scope-required]')).toContainText(
    'No te autorizó sus objetivos nutricionales',
  )
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  await expect(page.locator('[data-client-nutrition-goal]')).toHaveCount(0)
  expect(asked).toEqual(['first'])
})

test('the owner and admins read this like anybody who does not attend her', async ({ page }) => {
  await open(page, { clientCard: null })

  await expect(page.locator('[data-client-nutrition-goals-unreachable]')).toContainText(
    'No encontramos sus objetivos nutricionales',
  )
  await expect(page.getByRole('link', { name: 'Volver a clientes' })).toBeVisible()
})

test('criteria 2 to 4: an ended relationship falls back to nothing', async ({ page }) => {
  const paths: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/studio/v1/')) paths.push(url.pathname)
  })
  // Ended, she is attended by nobody here: the live read answers 404.
  await open(page, { clientCard: null })

  await expect(page.locator('[data-client-nutrition-goals-unreachable]')).toBeVisible()
  expect(paths.some((path) => path.includes('/historical-relationships/'))).toBe(false)
  // The screen's own, not the shell's: the sidebar always links to the cases section.
  await expect(
    page.locator('[data-client-nutrition-goals-screen]').getByRole('link', { name: /historial/i }),
  ).toHaveCount(0)
})

test('nothing proposed yet, and no goal of hers to show', async ({ page }) => {
  await open(page, { clientNutritionGoals: [], clientActiveNutritionGoal: null })

  await expect(page.locator('[data-client-nutrition-goals-nothing]')).toContainText(
    'Esta relación todavía no le ha propuesto objetivos',
  )
  await expect(page.locator('[data-client-nutrition-goals-active]')).toHaveCount(0)
})

test('her goal is shown even when this relationship proposed nothing', async ({ page }) => {
  await open(page, {
    clientNutritionGoals: [],
    clientActiveNutritionGoal: foreignActiveNutritionGoal,
  })

  await expect(page.locator('[data-client-nutrition-goals-active]')).toBeVisible()
  await expect(page.locator('[data-client-nutrition-goals-history]')).toContainText(
    'Esta relación todavía no le ha propuesto objetivos',
  )
})

test('a dropped connection offers a retry, which reads again', async ({ page }) => {
  // Studio retries a 503 once on its own, so the read fails twice to reach the screen.
  let failures = 2
  const asked = goalReads(page)
  await open(page, {
    intercept: (request) => {
      if (!request.path.endsWith('/nutrition/goals/versions') || failures === 0) return undefined
      failures -= 1
      return { status: 503, body: { type: 'upstream-unavailable', status: 503 } }
    },
  })

  await expect(page.locator('[data-client-nutrition-goals-failure]')).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.locator('[data-client-nutrition-goal]')).toHaveCount(3)
  expect(asked).toHaveLength(3)
})

test('the card opens it, and coming back reads again rather than remembering', async ({ page }) => {
  const asked = goalReads(page)
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [holderMembership], clientCard: goalSharingClientCard }),
  )
  await page.goto(CARD)
  await page.getByRole('link', { name: 'Ver sus objetivos' }).click()
  await expect(page).toHaveURL(GOALS)
  await expect(page.locator('[data-client-nutrition-goal]')).toHaveCount(3)

  await page.getByRole('link', { name: 'Volver a su ficha' }).click()
  await page.getByRole('link', { name: 'Ver sus objetivos' }).click()
  await expect(page.locator('[data-client-nutrition-goal]')).toHaveCount(3)
  expect(asked).toEqual(['first', 'first'])
})

test('more proposals are read only when asked for', async ({ page }) => {
  const many = Array.from({ length: 21 }, (_, at) => ({
    ...clientNutritionGoalVersions[2],
    id: `01991600-7000-7000-8000-0000000008${String(at).padStart(2, '0')}`,
  }))
  const asked = goalReads(page)
  await open(page, { clientNutritionGoals: many })

  await expect(page.locator('[data-client-nutrition-goal]')).toHaveCount(20)
  expect(asked).toEqual(['first'])
  await page.getByRole('button', { name: 'Ver más propuestas' }).click()
  await expect(page.locator('[data-client-nutrition-goal]')).toHaveCount(21)
  expect(asked).toEqual(['first', '20'])
})
