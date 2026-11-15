import { expect, test, type Page, type Request } from '@playwright/test'

import {
  clientCard,
  clientNutritionGoalVersions,
  createStudioApiFixture,
  goalSharingClientCard,
  holderMembership,
  installStudioApiMock,
  nutritionProfessionalMe,
  type StudioApiFixture,
} from './studio-api-mock'

/**
 * HU-STUDIO-071 — a verified nutrition professional proposes a client a version
 * of her goals.
 *
 * What this suite guards most is what the reader is told before pressing: that
 * nothing changes until she decides, that it is not a menu, and that a proposal
 * still waiting is replaced. And that the three refusals of criterion 1 read as
 * three different things.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const GOALS = `/organizations/${ORG}/clients/people/${PERSON}/nutrition-goals`

async function open(page: Page, overrides: Partial<StudioApiFixture> = {}) {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      clientCard: goalSharingClientCard,
      me: nutritionProfessionalMe,
      ...overrides,
    }),
  )
  await page.goto(GOALS)
  await expect(page.locator('[data-client-nutrition-goal]').first()).toBeVisible()
}

function proposals(page: Page): Request[] {
  const sent: Request[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/nutrition/goals/versions')) {
      sent.push(request)
    }
  })
  return sent
}

async function choose(page: Page, nutrient: string, mode: string) {
  await page.getByRole('combobox', { name: nutrient, exact: true }).click()
  await page.getByRole('option', { name: mode, exact: true }).click()
}

async function fillProteinAndReason(page: Page) {
  await page.getByRole('button', { name: 'Proponer objetivos' }).click()
  await choose(page, 'Proteína', 'Al menos')
  await page.getByLabel('Proteína: al menos (g)').fill('150')
  await page.getByLabel('Por qué se lo propones').fill('Para sostener el bloque de fuerza.')
}

test('criterion 1: with the three conditions, the reader is offered to propose', async ({
  page,
}) => {
  await open(page)

  await expect(page.getByRole('button', { name: 'Proponer objetivos' })).toBeVisible()
  await expect(page.locator('[data-client-nutrition-goal-blockers]')).toHaveCount(0)
})

test('criterion 1: each condition missing is said, and nothing is offered', async ({ page }) => {
  await open(page, {
    me: { profile: null, memberships: [] },
    clientCard: {
      ...goalSharingClientCard,
      sections: goalSharingClientCard.sections.map((section) =>
        section.scope_code === 'nutrition_guidance'
          ? { ...section, access_level: 'read' }
          : section,
      ),
    },
  })

  const blockers = page.locator('[data-client-nutrition-goal-blockers]')
  await expect(blockers).toContainText('Para proponerle objetivos te falta')
  await expect(blockers.locator('li')).toHaveCount(2)
  await expect(blockers).toContainText('credencial de nutrición verificada y vigente')
  await expect(blockers).toContainText('contribuir en sus objetivos nutricionales')
  await expect(blockers).not.toContainText('Tu rol')
  await expect(page.getByRole('button', { name: 'Proponer objetivos' })).toHaveCount(0)
})

test('criteria 2, 4 and 5 are said before anything is sent', async ({ page }) => {
  const sent = proposals(page)
  await open(page)
  await page.getByRole('button', { name: 'Proponer objetivos' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('No cambia nada hasta que ella decida')
  await expect(dialog).toContainText('no es un menú ni una indicación clínica')
  await expect(dialog.locator('[data-goal-proposal-replaces]')).toContainText('queda reemplazada')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  expect(sent).toHaveLength(0)
})

test('with nothing waiting on her, there is nothing to replace', async ({ page }) => {
  await open(page, {
    clientNutritionGoals: clientNutritionGoalVersions.filter(
      (version) => version.status !== 'proposed',
    ),
  })
  await page.getByRole('button', { name: 'Proponer objetivos' }).click()

  await expect(page.getByRole('dialog')).toContainText('No cambia nada hasta que ella decida')
  await expect(page.locator('[data-goal-proposal-replaces]')).toHaveCount(0)
})

test('proposes: every key of a target travels, and the new one waits on her', async ({ page }) => {
  const sent = proposals(page)
  await open(page)
  await page.getByRole('button', { name: 'Proponer objetivos' }).click()
  await choose(page, 'Energía', 'Entre')
  await page.getByLabel('Energía: desde (kcal)').fill('2100')
  await page.getByLabel('Energía: hasta (kcal)').fill('2400')
  await choose(page, 'Proteína', 'Al menos')
  await page.getByLabel('Proteína: al menos (g)').fill('150')
  await page.getByLabel('Por qué se lo propones').fill('  Para sostener el bloque de fuerza.  ')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(sent).toHaveLength(1)
  const [request] = sent
  expect(request?.postDataJSON()).toEqual({
    rationale: 'Para sostener el bloque de fuerza.',
    targets: [
      {
        nutrient_code: 'energy',
        mode: 'range',
        minimum: 2100,
        maximum: 2400,
        exact: null,
        unit: 'kcal',
      },
      {
        nutrient_code: 'protein',
        mode: 'minimum',
        minimum: 150,
        maximum: null,
        exact: null,
        unit: 'g',
      },
    ],
  })
  const headers = request?.headers() ?? {}
  expect(headers['idempotency-key']).toBeTruthy()
  expect(headers['command-id']).toBeTruthy()

  await expect(page.locator('[data-client-nutrition-goal-proposed]')).toContainText(
    'No cambia nada hasta que ella decida',
  )
  await expect(page.locator('[data-client-nutrition-goal-status]')).toHaveText([
    'Esperando su decisión',
    'Reemplazado',
    'Lo sigue hoy',
    'Rechazado',
  ])
  await expect(page.locator('[data-client-nutrition-goal]').first()).toContainText(
    'Proteína: al menos 150 g',
  )
  // Criterion 2: her goal today is the one she had.
  await expect(
    page.locator('[data-client-nutrition-goals-active] [data-client-nutrition-goal-targets] li'),
  ).toHaveText(['Proteína: entre 110 y 130 g', 'Fibra: al menos 25 g'])
})

test('the form refuses what the contract would, and sends nothing', async ({ page }) => {
  const sent = proposals(page)
  await open(page)
  await page.getByRole('button', { name: 'Proponer objetivos' }).click()
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Elige al menos un nutriente.')
  await expect(dialog).toContainText('Escribe por qué se lo propones')

  await choose(page, 'Energía', 'Entre')
  await page.getByLabel('Energía: desde (kcal)').fill('2400')
  await page.getByLabel('Energía: hasta (kcal)').fill('2100')
  await choose(page, 'Grasa', 'Como máximo')
  await page.getByLabel('Grasa: como máximo (g)').fill('70 g')
  await page.getByLabel('Por qué se lo propones').fill('   ')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()

  await expect(dialog).toContainText('«Hasta» no puede ser menor que «Desde».')
  await expect(dialog).toContainText('Escribe solo el número, sin la unidad.')
  await expect(dialog).toContainText('Escribe por qué se lo propones')
  expect(sent).toHaveLength(0)
})

for (const [outcome, title] of [
  ['forbidden', 'Tu rol no orienta nutrición'],
  ['credential-required', 'Falta tu credencial de nutrición'],
  ['scope-required', 'Ella no te permite proponerle objetivos'],
  ['service-paused', 'Su servicio está en pausa'],
] as const) {
  test(`a ${outcome} refusal is said in its own words, and nothing is created`, async ({
    page,
  }) => {
    await open(page, { goalProposalOutcome: outcome })
    await fillProteinAndReason(page)
    await page.getByRole('button', { name: 'Enviar la propuesta' }).click()

    const refusal = page.locator('[data-goal-proposal-refusal]')
    await expect(refusal).toContainText(title)
    await expect(refusal).toContainText('No se creó nada.')
    await expect(page.locator('[data-client-nutrition-goal-status]').first()).toHaveText(
      'Esperando su decisión',
    )
  })
}

test('criterion 7: a dropped connection keeps what was typed, and retrying is the same command', async ({
  page,
}) => {
  let failures = 1
  const sent = proposals(page)
  await open(page, {
    intercept: (request) => {
      if (request.method !== 'POST' || !request.path.endsWith('/nutrition/goals/versions')) {
        return undefined
      }
      if (failures === 0) return undefined
      failures -= 1
      return { status: 503, body: { type: 'upstream-unavailable', status: 503 } }
    },
  })
  await fillProteinAndReason(page)
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()

  await expect(page.locator('[data-goal-proposal-refusal]')).toContainText('necesita conexión')
  await expect(page.getByLabel('Proteína: al menos (g)')).toHaveValue('150')
  await page.getByRole('button', { name: 'Enviar la propuesta' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(sent).toHaveLength(2)
  expect(sent[0]?.headers()['command-id']).toBe(sent[1]?.headers()['command-id'])
})
