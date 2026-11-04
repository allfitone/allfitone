import { expect, test } from '@playwright/test'

import {
  activeSession,
  catalogueEntry,
  catalogueEquipment,
  createBackofficeFixture,
  globalCatalogueFixture,
  mockBackofficeApi,
  type GlobalCatalogueFixture,
} from './backoffice-api-mock'

function fixtureWith(globalCatalogue: GlobalCatalogueFixture) {
  return createBackofficeFixture({ session: activeSession(), globalCatalogue })
}

function commands(fixture: ReturnType<typeof fixtureWith>) {
  return fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.includes('/catalogue'),
  )
}

test('Allfit publishes a discipline and it becomes available to choose from', async ({
  context,
  page,
}) => {
  const fixture = fixtureWith(globalCatalogueFixture())
  await mockBackofficeApi(context, fixture)

  await page.goto('/catalogue')

  const disciplines = page.locator('[data-catalogue-section="discipline"]')
  await expect(disciplines.getByText('Todavía no hay nada publicado aquí.')).toBeVisible()

  await disciplines.getByLabel('Código').fill('test_global_yoga')
  await disciplines.getByLabel('Nombre').fill('Yoga')
  await disciplines.getByRole('button', { name: 'Publicar disciplina' }).click()

  await expect(page.locator('[data-catalogue-outcome]')).toContainText('gimnasios y personas')
  await expect(disciplines.locator('[data-catalogue-entry]')).toHaveCount(1)

  const sent = commands(fixture)
  expect(sent).toHaveLength(1)
  expect(sent[0]?.path).toBe('/backoffice/v1/catalogue/disciplines')
  expect(sent[0]?.body).toEqual({ code: 'test_global_yoga', name: 'Yoga' })
  expect(sent[0]?.headers['idempotency-key']).toBeTruthy()

  // The published discipline is what an activity type can be published under.
  const activityTypes = page.locator('[data-catalogue-section="activity_type"]')
  await expect(activityTypes.getByRole('combobox', { name: 'Disciplina' })).toBeEnabled()
})

test('nothing on the screen offers to publish a gym’s content as global', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    fixtureWith(globalCatalogueFixture({ disciplines: [catalogueEntry()] })),
  )

  await page.goto('/catalogue')

  const labels = await page.locator('[data-global-catalogue] label').allInnerTexts()
  expect(labels.some((label) => /gimnasio|organizaci|dueñ|alcance/i.test(label))).toBe(false)
  await expect(page.getByRole('textbox', { name: /gimnasio/i })).toHaveCount(0)
})

test('a code that already names something else is refused, with the reason', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    fixtureWith(
      globalCatalogueFixture({
        disciplines: [catalogueEntry()],
        commandRefusal: { status: 409, code: 'conflict' },
      }),
    ),
  )

  await page.goto('/catalogue')
  const disciplines = page.locator('[data-catalogue-section="discipline"]')
  await disciplines.getByLabel('Código').fill('test_global_yoga')
  await disciplines.getByLabel('Nombre').fill('Pilates')
  await disciplines.getByRole('button', { name: 'Publicar disciplina' }).click()

  await expect(page.locator('[data-catalogue-failure]')).toContainText('ya nombra otra cosa')
})

test('a malformed code never becomes a request', async ({ context, page }) => {
  const fixture = fixtureWith(globalCatalogueFixture())
  await mockBackofficeApi(context, fixture)

  await page.goto('/catalogue')
  const disciplines = page.locator('[data-catalogue-section="discipline"]')
  await disciplines.getByLabel('Código').fill('Yoga Global')
  await disciplines.getByLabel('Nombre').fill('Yoga')
  await disciplines.getByRole('button', { name: 'Publicar disciplina' }).click()

  await expect(disciplines.getByText(/El código va en minúsculas/)).toBeVisible()
  expect(commands(fixture)).toHaveLength(0)
})

test('archiving says what depends on the entry and asks before withdrawing it', async ({
  context,
  page,
}) => {
  const movement = catalogueEntry({
    kind: 'movement',
    code: null,
    name: 'Guerrero II',
    in_use_count: 3,
  })
  const fixture = fixtureWith(
    globalCatalogueFixture({ disciplines: [catalogueEntry()], movements: [movement] }),
  )
  await mockBackofficeApi(context, fixture)

  await page.goto('/catalogue')
  const movements = page.locator('[data-catalogue-section="movement"]')
  await expect(movements.getByText('3 referencias', { exact: false })).toBeVisible()

  await movements.getByRole('button', { name: 'Archivar Guerrero II' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('sigue funcionando')
  expect(commands(fixture)).toHaveLength(0)

  await dialog.getByRole('button', { name: 'Sí, archivar' }).click()

  await expect(page.locator('[data-catalogue-outcome]')).toContainText('Sale de las búsquedas')
  await expect(movements.locator('[data-catalogue-entry][data-status="archived"]')).toBeVisible()
  expect(commands(fixture)[0]?.path).toBe(
    `/backoffice/v1/catalogue/movements/${movement.id}/archival`,
  )
  expect(commands(fixture)[0]?.body).toEqual({})
})

test('keeping the entry from the archive dialog archives nothing', async ({ context, page }) => {
  const movement = catalogueEntry({ kind: 'movement', code: null, name: 'Guerrero II' })
  const fixture = fixtureWith(
    globalCatalogueFixture({ disciplines: [catalogueEntry()], movements: [movement] }),
  )
  await mockBackofficeApi(context, fixture)

  await page.goto('/catalogue')
  const movements = page.locator('[data-catalogue-section="movement"]')
  await movements.getByRole('button', { name: 'Archivar Guerrero II' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('¿Archivar movimiento «Guerrero II»?')
  await dialog.getByRole('button', { name: 'Mantener en las búsquedas' }).click()

  await expect(dialog).toBeHidden()
  await expect(movements.locator('[data-catalogue-entry][data-status="published"]')).toBeVisible()
  await expect(movements.locator('[data-catalogue-entry][data-status="archived"]')).toHaveCount(0)
  expect(commands(fixture)).toHaveLength(0)
})

test('a discipline whose content is still published is not archived, and the screen says why', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    fixtureWith(
      globalCatalogueFixture({
        disciplines: [catalogueEntry()],
        activityTypes: [
          catalogueEntry({ kind: 'activity_type', code: 'test_global_flow', name: 'Flow' }),
        ],
      }),
    ),
  )

  await page.goto('/catalogue')
  const disciplines = page.locator('[data-catalogue-section="discipline"]')
  await disciplines.getByRole('button', { name: 'Archivar Yoga' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sí, archivar' }).click()

  await expect(page.locator('[data-catalogue-failure]')).toContainText(
    'todavía tiene contenido publicado',
  )
})

test('an archived entry is shown as archived and offers no archive button', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    fixtureWith(
      globalCatalogueFixture({
        disciplines: [catalogueEntry({ status: 'archived' })],
      }),
    ),
  )

  await page.goto('/catalogue')
  const row = page.locator('[data-catalogue-entry][data-status="archived"]')

  await expect(row.getByText('Archivado')).toBeVisible()
  await expect(row.getByRole('button')).toHaveCount(0)
  await expect(row.locator('[data-catalogue-reason]')).toContainText('fuera de las búsquedas')
})

test('a publication lost to the network is retried with the same command', async ({
  context,
  page,
}) => {
  const fixture = fixtureWith(globalCatalogueFixture({ lostCommands: 1 }))
  await mockBackofficeApi(context, fixture)

  await page.goto('/catalogue')
  const disciplines = page.locator('[data-catalogue-section="discipline"]')
  await disciplines.getByLabel('Código').fill('test_global_yoga')
  await disciplines.getByLabel('Nombre').fill('Yoga')
  const publish = disciplines.getByRole('button', { name: 'Publicar disciplina' })

  await publish.click()
  await expect(page.locator('[data-catalogue-failure]')).toContainText(
    'No hay conexión con el API.',
  )
  await publish.click()
  await expect(page.locator('[data-catalogue-outcome]')).toBeVisible()

  const attempts = commands(fixture)
  expect(attempts).toHaveLength(2)
  expect(attempts[1]?.headers['idempotency-key']).toBe(attempts[0]?.headers['idempotency-key'])
  expect(attempts[1]?.headers['command-id']).toBe(attempts[0]?.headers['command-id'])
})

test('Allfit publishes equipment and the list says how many movements use it', async ({
  context,
  page,
}) => {
  const fixture = fixtureWith(globalCatalogueFixture())
  await mockBackofficeApi(context, fixture)

  await page.goto('/catalogue')
  await page.locator('#equipment-code').fill('test_barbell')
  await page.locator('#equipment-name').fill('Barra olímpica')
  await page.getByRole('button', { name: 'Publicar equipamiento' }).click()

  await expect(page.locator('[data-catalogue-outcome]')).toContainText('«Barra olímpica»')
  await expect(page.locator('[data-catalogue-equipment-entry]')).toContainText(
    'Ningún movimiento lo usa todavía.',
  )
  expect(commands(fixture).map((request) => [request.path, request.body])).toEqual([
    ['/backoffice/v1/catalogue/equipment', { code: 'test_barbell', name: 'Barra olímpica' }],
  ])
})

test('a movement says what it uses, and its whole list is sent at once', async ({
  context,
  page,
}) => {
  const movement = catalogueEntry({
    kind: 'movement',
    name: 'Press de banca',
    equipment: [{ code: 'test_bench', name: 'Banco plano', requirement: 'optional' }],
  })
  const fixture = fixtureWith(
    globalCatalogueFixture({
      disciplines: [catalogueEntry()],
      movements: [movement],
      equipment: [
        catalogueEquipment(),
        catalogueEquipment({ code: 'test_bench', name: 'Banco plano', in_use_count: 1 }),
      ],
    }),
  )
  await mockBackofficeApi(context, fixture)

  await page.goto('/catalogue')
  await expect(page.locator('[data-movement-equipment]')).toHaveText('Opcional: Banco plano.')
  await page.getByRole('button', { name: 'Editar el equipamiento de Press de banca' }).click()
  await page.locator('#movement-equipment-test_barbell').click()
  await page.getByRole('option', { name: 'Lo necesita', exact: true }).click()
  await page.locator('[data-movement-equipment-save]').click()

  await expect(page.locator('[data-catalogue-outcome]')).toContainText(
    'Necesita: Barra olímpica. Opcional: Banco plano.',
  )
  await expect(page.locator('[data-movement-equipment]')).toHaveText(
    'Necesita: Barra olímpica. Opcional: Banco plano.',
  )
  expect(commands(fixture).map((request) => [request.path, request.body])).toEqual([
    [
      `/backoffice/v1/catalogue/movements/${movement.id}/equipment`,
      {
        items: [
          { code: 'test_barbell', requirement: 'required' },
          { code: 'test_bench', requirement: 'optional' },
        ],
      },
    ],
  ])
})

test('without the curation duty the screen says which duty it needs', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    fixtureWith(globalCatalogueFixture({ refusal: { status: 403, code: 'forbidden' } })),
  )

  await page.goto('/catalogue')

  await expect(page.locator('[data-global-catalogue]')).toContainText('deber de curaduría')
  await expect(page.locator('[data-catalogue-section="discipline"]')).toHaveCount(0)
})
