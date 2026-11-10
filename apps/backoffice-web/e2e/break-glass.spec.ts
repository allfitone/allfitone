import { expect, test } from '@playwright/test'

import {
  BREAK_GLASS_PEER_ID,
  activeSession,
  createBackofficeFixture,
  legacyPendingBreakGlass,
  mockBackofficeApi,
  openBreakGlassWindow,
} from './backoffice-api-mock'

const PATH = '/break-glass'
const SUBJECT = '019a3000-0000-7000-8000-000000000002'

test('offers only the categories that can be approved', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), breakGlass: { files: [] } }),
  )

  await page.goto(PATH)

  // Six, and the forbidden ones are absent rather than disabled: an option that can
  // never be granted is an invitation to try.
  await expect(page.getByRole('checkbox')).toHaveCount(6)
  await expect(page.getByRole('checkbox', { name: 'Contexto de salud' })).toBeVisible()
  for (const forbidden of ['Fotos', 'Pagos', 'Identidad', 'Toda la cuenta']) {
    await expect(page.getByRole('checkbox', { name: new RegExp(forbidden, 'i') })).toHaveCount(0)
  }
})

test('the tier is a consequence of the scope, never a field to choose', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: { files: [] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)

  // Nothing states a tier until a scope exists to derive one from.
  await expect(page.locator('[data-break-glass-consequence]')).toHaveCount(0)

  await page.getByRole('checkbox', { name: 'Guía nutricional' }).click()
  await expect(
    page.getByText(/Alcance estándar: la ventana se abre al pedirla y dura 60 minutos/),
  ).toBeVisible()

  // A stricter category moves the tier, and nothing else: every window opens when asked
  // for and lasts an hour (ADR-046). There is no control for the tier or the minutes.
  await page.getByRole('checkbox', { name: 'Contexto de salud' }).click()
  await expect(
    page.getByText(/Alcance restringido: la ventana se abre al pedirla y dura 60 minutos/),
  ).toBeVisible()
  await expect(page.locator('[data-break-glass-consequence]')).not.toContainText('aprobación')
  await expect(page.getByRole('combobox', { name: /Alcance|Aprobaciones|Duración/ })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /Aprobaciones|Duración|Minutos/ })).toHaveCount(0)
})

test('asking opens the window at once, without naming the tier or the duration', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: { files: [] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUBJECT)
  await page.getByLabel('Referencia del caso').fill('CASE-2026-777')
  await page.getByRole('checkbox', { name: 'Contexto de salud' }).click()
  await page.getByRole('button', { name: 'Pedir la ventana' }).click()

  await expect(page.getByText(/Ventana abierta por 60 minutos/)).toBeVisible()
  // The requester reads at once: nobody else has to approve it first.
  await expect(page.getByText('Ventana abierta', { exact: true })).toBeVisible()
  await expect(page.getByText(/Quedan (59|60) minutos de ventana/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leer contexto de salud' })).toBeVisible()

  const posted = fixture.requests.filter(
    (request) =>
      request.method === 'POST' && request.path === '/backoffice/v1/break-glass/requests',
  )
  expect(posted).toHaveLength(1)
  const body = posted[0]?.body as Record<string, unknown>
  expect(body.case_reference).toBe('CASE-2026-777')
  expect(body.categories).toEqual(['health_context'])
  // The derived facts are the server's. Sending them would be a second source of
  // truth for what an exceptional access is.
  expect(body).not.toHaveProperty('sensitivity_tier')
  expect(body).not.toHaveProperty('required_approvals')
  expect(body).not.toHaveProperty('requested_duration_minutes')
  expect(posted[0]?.headers['idempotency-key']).toBeTruthy()
  expect(posted[0]?.headers['command-id']).toBeTruthy()
})

test('refuses a request with no scope instead of sending one', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: { files: [] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByLabel('Persona afectada').fill(SUBJECT)
  await page.getByLabel('Referencia del caso').fill('CASE-2026-778')
  await page.getByRole('button', { name: 'Pedir la ventana' }).click()

  await expect(page.getByText(/no existe acceso a «toda la cuenta»/)).toBeVisible()
  expect(
    fixture.requests.filter(
      (request) =>
        request.method === 'POST' && request.path === '/backoffice/v1/break-glass/requests',
    ),
  ).toHaveLength(0)
})

test('nobody is asked to approve a window: another admin sees it open, with nothing to decide', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: {
      files: [
        openBreakGlassWindow(40, {
          requester_person_id: BREAK_GLASS_PEER_ID,
          categories: ['health_context'],
          case_reference: 'CASE-2026-779',
          viewer_is_requester: false,
        }),
      ],
    },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)

  await expect(page.getByText('Ventana abierta', { exact: true })).toBeVisible()
  await expect(page.locator('[data-break-glass-file]')).toContainText('Restringido · 60 minutos')
  for (const name of ['Aprobar', 'Rechazar', /Leer /]) {
    await expect(page.getByRole('button', { name })).toHaveCount(0)
  }
  await expect(page.getByRole('combobox', { name: /Motivo/ })).toHaveCount(0)
  expect(fixture.requests.filter((request) => request.path.endsWith('/decisions'))).toHaveLength(0)
})

test('a request from before the change that never opened says so, and offers nothing', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: { files: [legacyPendingBreakGlass({ case_reference: 'CASE-2026-780' })] },
    }),
  )

  await page.goto(PATH)

  await expect(page.getByText('Pedida antes del cambio, sin abrir')).toBeVisible()
  await expect(page.locator('[data-break-glass-window]')).toHaveCount(0)
  for (const name of ['Aprobar', 'Rechazar', /Leer /, 'Cerrar la ventana']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0)
  }
})

test('a window says how much is left and where it closes', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: { files: [openBreakGlassWindow(5, { categories: ['nutrition_guidance'] })] },
    }),
  )

  await page.goto(PATH)

  await expect(page.locator('[data-break-glass-window]')).toBeVisible()
  await expect(page.getByText(/Quedan 5 minutos de ventana/)).toBeVisible()
  await expect(page.getByText(/Para continuar después hay que pedir otra ventana/)).toBeVisible()
})

test('an authorised read that finds nothing is reported as recorded, not as a failure', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: { files: [openBreakGlassWindow(10, { categories: ['nutrition_guidance'] })] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer guía nutricional' }).click()

  const outcome = page.locator('[data-break-glass-outcome]')
  await expect(outcome).toBeVisible()
  await expect(outcome.getByText('Intento registrado', { exact: true })).toBeVisible()
  await expect(
    outcome.getByText(/esa categoría todavía no guarda contenido en la plataforma/),
  ).toBeVisible()
  // The person whose data it was sees the same attempt. Saying so is the point of
  // the screen, not a footnote.
  await expect(
    outcome.getByText(/verá este intento en su propio registro de accesos/),
  ).toBeVisible()

  const read = fixture.requests.filter((request) => request.path.endsWith('/reads'))
  expect(read).toHaveLength(1)
  expect((read[0]?.body as Record<string, unknown>).category).toBe('nutrition_guidance')
  // No command identifiers: each attempt is a new event, so there is nothing to
  // converge on and nothing to replay.
  expect(read[0]?.headers['idempotency-key']).toBeUndefined()
})

test('an authorised read of body progress shows the measurements until the window closes', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: {
      files: [openBreakGlassWindow(10, { categories: ['body_progress'] })],
      bodyProgress: [
        {
          id: '019a8000-0000-7000-8000-000000000701',
          metric_code: 'waist',
          value: 0.82,
          unit_code: 'm',
          original_value: 82,
          original_unit_code: 'cm',
          measured_on: '2026-09-01',
          has_media: true,
          recorded_at: '2026-09-01T11:00:00.000Z',
        },
        {
          id: '019a8000-0000-7000-8000-000000000702',
          metric_code: 'body_weight',
          value: 80,
          unit_code: 'kg',
          original_value: 176.37,
          original_unit_code: 'lb',
          measured_on: '2026-08-31',
          has_media: false,
          recorded_at: '2026-08-31T11:00:00.000Z',
        },
      ],
      // A day with photos and no measurement still says it has them.
      bodyPhotoDays: [
        { taken_on: '2026-09-01', photos: 2 },
        { taken_on: '2026-08-15', photos: 1 },
      ],
    },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer progreso corporal' }).click()

  const outcome = page.locator('[data-break-glass-outcome]')
  await expect(outcome.getByText('Lectura autorizada y registrada')).toBeVisible()
  await expect(
    outcome.getByText(/verá este intento en su propio registro de accesos/),
  ).toBeVisible()

  // As the person recorded it and as the platform normalized it; a photo is a flag.
  const measurements = page.getByRole('table', { name: 'Mediciones de la persona' })
  const waist = measurements.getByRole('row', { name: /Cintura/ })
  await expect(waist).toContainText('82 cm')
  await expect(waist).toContainText('0,82 m')
  await expect(waist).toContainText('1 de septiembre de 2026')
  await expect(waist).toContainText('Tiene foto; no se muestra aquí')
  const weight = measurements.getByRole('row', { name: /Peso/ })
  await expect(weight).toContainText('176,37 lb')
  await expect(weight).toContainText('80 kg')
  await expect(measurements.getByRole('img')).toHaveCount(0)

  // HU-BO-009 criterion 3: that photos exist is known, the photos are not.
  const photoDays = page.getByRole('table', { name: 'Días con fotos de progreso' })
  await expect(photoDays.getByRole('row', { name: /1 de septiembre de 2026/ })).toContainText(
    '2 fotos',
  )
  await expect(photoDays.getByRole('row', { name: /15 de agosto de 2026/ })).toContainText('1 foto')
  await expect(photoDays.getByRole('img')).toHaveCount(0)

  // The evidence names the table that was opened, not a generic one.
  const read = fixture.requests.filter((request) => request.path.endsWith('/reads'))
  expect(read).toHaveLength(1)
  expect(read[0]?.body).toEqual({
    category: 'body_progress',
    resource_type: 'identity.body_progress_records',
  })
  expect(fixture.breakGlass?.files[0]?.exercise_count).toBe(1)

  // Closing the window takes the content off the screen with it.
  await page.getByRole('button', { name: 'Cerrar la ventana' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar ahora' }).click()
  await expect(page.getByText(/Ninguna lectura entrega contenido desde ahora/)).toBeVisible()
  await expect(measurements).toHaveCount(0)
  await expect(page.getByText('82 cm')).toHaveCount(0)
})

test('an authorised read of someone with no measurements says so', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: {
        files: [openBreakGlassWindow(10, { categories: ['body_progress'] })],
        bodyProgress: [],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer progreso corporal' }).click()

  const outcome = page.locator('[data-break-glass-outcome]')
  await expect(outcome.getByText('Lectura autorizada y registrada')).toBeVisible()
  await expect(outcome.getByText(/La persona no tiene mediciones registradas/)).toBeVisible()
  await expect(page.getByRole('table', { name: 'Mediciones de la persona' })).toHaveCount(0)
})

const SHOULDER = {
  id: '019a8000-0000-7000-8000-000000000801',
  context_type: 'limitation',
  description: 'No puedo levantar los brazos por encima de la cabeza',
  body_area: 'shoulder',
  provenance: 'person_declared',
  valid_from: '2026-09-01T10:00:00.000Z',
  valid_to: null,
  recorded_at: '2026-09-01T10:05:00.000Z',
}

test('an authorised read of health context shows what the person declared, and who said it', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: {
      files: [openBreakGlassWindow(10, { categories: ['health_context'] })],
      healthContext: [
        SHOULDER,
        {
          id: '019a8000-0000-7000-8000-000000000802',
          context_type: 'recovery',
          description: 'Recuperación de esguince',
          body_area: null,
          provenance: 'person_declared',
          valid_from: '2026-08-20T10:00:00.000Z',
          valid_to: '2026-10-01T10:00:00.000Z',
          recorded_at: '2026-08-20T10:05:00.000Z',
        },
      ],
    },
  })
  await mockBackofficeApi(context, fixture)
  // A laptop screen: the claims fit without scrolling sideways.
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer contexto de salud' }).click()

  const outcome = page.locator('[data-break-glass-outcome]')
  await expect(outcome.getByText('Lectura autorizada y registrada')).toBeVisible()

  const claims = page.getByRole('table', { name: 'Contexto de salud de la persona' })
  const shoulder = claims.getByRole('row', { name: /Limitación/ })
  await expect(shoulder).toContainText('No puedo levantar los brazos por encima de la cabeza')
  await expect(shoulder).toContainText('Hombro')
  await expect(shoulder).toContainText('Sin fecha de fin')
  await expect(shoulder).toContainText('Lo declaró la persona')
  // The sentence wraps rather than pushing the dates and the origin out of sight.
  await expect(shoulder.getByRole('cell').nth(1)).toHaveCSS('white-space', 'normal')
  const region = page.getByRole('region', { name: 'Contexto de salud de la persona' })
  expect(await region.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await expect(claims.getByRole('row', { name: /Recuperación/ })).toContainText('Sin zona indicada')
  await expect(page.getByRole('table', { name: 'Mediciones de la persona' })).toHaveCount(0)

  const read = fixture.requests.filter((request) => request.path.endsWith('/reads'))
  expect(read[0]?.body).toEqual({
    category: 'health_context',
    resource_type: 'identity.health_context_claims',
  })

  await page.getByRole('button', { name: 'Cerrar la ventana' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar ahora' }).click()
  await expect(page.getByText(/Ninguna lectura entrega contenido desde ahora/)).toBeVisible()
  await expect(claims).toHaveCount(0)
  await expect(page.getByText('No puedo levantar los brazos por encima de la cabeza')).toHaveCount(
    0,
  )
})

test('an authorised read of someone who declared nothing says so', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: {
        files: [openBreakGlassWindow(10, { categories: ['health_context'] })],
        healthContext: [],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer contexto de salud' }).click()

  const outcome = page.locator('[data-break-glass-outcome]')
  await expect(
    outcome.getByText(/La persona no ha declarado dolores, limitaciones ni recuperaciones/),
  ).toBeVisible()
  await expect(page.getByRole('table', { name: 'Contexto de salud de la persona' })).toHaveCount(0)
})

test('an authorised read of nutrition intake shows what the person ate and what it added up to', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: {
      files: [openBreakGlassWindow(10, { categories: ['nutrition_intake'] })],
      meals: [
        {
          id: '019a8000-0000-7000-8000-000000000901',
          occurred_at: '2026-09-15T23:30:00+00:00',
          local_date: '2026-09-15',
          timezone: 'America/Bogota',
          meal_type: 'dinner',
          note: 'Con poca sal, sin aceite y con el arroz del día anterior recalentado',
          revision_number: 0,
          has_media: true,
          items: [
            {
              position: 1,
              name: 'Pollo a la plancha',
              quantity: 120,
              quantity_unit: 'g',
              nutrients: [
                { nutrient_code: 'energy', value: 198, unit: 'kcal' },
                { nutrient_code: 'protein', value: 37.5, unit: 'g' },
              ],
            },
            {
              position: 2,
              name: 'Arroz blanco',
              quantity: 150,
              quantity_unit: 'g',
              nutrients: [
                { nutrient_code: 'energy', value: 195, unit: 'kcal' },
                { nutrient_code: 'carbohydrates', value: 42, unit: 'g' },
              ],
            },
          ],
        },
      ],
    },
  })
  await mockBackofficeApi(context, fixture)
  // A laptop screen: the meals fit without scrolling sideways.
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer ingesta nutricional' }).click()

  const outcome = page.locator('[data-break-glass-outcome]')
  await expect(outcome.getByText('Lectura autorizada y registrada')).toBeVisible()

  const meals = page.getByRole('table', { name: 'Comidas de la persona' })
  const dinner = meals.getByRole('row', { name: /Cena/ })
  await expect(dinner).toContainText('America/Bogota')
  await expect(dinner).toContainText('Pollo a la plancha, 120 g · Arroz blanco, 150 g')
  await expect(dinner).toContainText('393 kcal · 37,5 g de proteína · 42 g de carbohidratos')
  await expect(dinner).toContainText('Con poca sal')
  await expect(dinner).toContainText('Tiene foto; no se muestra aquí')
  await expect(meals.getByRole('img')).toHaveCount(0)
  const region = page.getByRole('region', { name: 'Comidas de la persona' })
  expect(await region.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)

  const read = fixture.requests.filter((request) => request.path.endsWith('/reads'))
  expect(read[0]?.body).toEqual({ category: 'nutrition_intake', resource_type: 'nutrition.meals' })

  await page.getByRole('button', { name: 'Cerrar la ventana' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar ahora' }).click()
  await expect(page.getByText(/Ninguna lectura entrega contenido desde ahora/)).toBeVisible()
  await expect(meals).toHaveCount(0)
  await expect(page.getByText('Pollo a la plancha, 120 g')).toHaveCount(0)
})

test('an authorised read of someone who recorded no meals says so', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: {
        files: [openBreakGlassWindow(10, { categories: ['nutrition_intake'] })],
        meals: [],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer ingesta nutricional' }).click()

  await expect(
    page.locator('[data-break-glass-outcome]').getByText(/La persona no ha registrado comidas/),
  ).toBeVisible()
  await expect(page.getByRole('table', { name: 'Comidas de la persona' })).toHaveCount(0)
})

test('an authorised read of prior training shows each session and what it held', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: {
      files: [openBreakGlassWindow(10, { categories: ['prior_training_history'] })],
      sessions: [
        {
          id: '019a8000-0000-7000-8000-000000000a01',
          activity_type_code: 'strength_session',
          activity_type_name: 'Sesión de fuerza',
          discipline_code: 'strength',
          started_at: '2026-09-15T12:00:00+00:00',
          ended_at: '2026-09-15T13:15:00+00:00',
          timezone: 'America/Bogota',
          status: 'completed',
          validation_status: 'pending',
          requested_level: 'detailed',
          achieved_level: null,
          revision_number: 3,
          capture_source: 'manual',
          contract: { id: '019c0000-0000-7000-8000-000000000031', version: 1 },
          segments: [{ position: 1, activity_type_code: 'strength_session' }],
          strength_sets: [
            {
              segment_position: 1,
              order: 1,
              movement_id: null,
              movement_name: 'Sentadilla',
              achieved_reps: 8,
              load: { value: 80, unit: 'kg' },
              rpe: 7,
            },
            {
              segment_position: 1,
              order: 2,
              movement_id: null,
              movement_name: 'Sentadilla',
              achieved_reps: 6,
              load: { value: 85, unit: 'kg' },
              rpe: 8,
            },
          ],
          endurance_laps: [],
        },
        {
          id: '019a8000-0000-7000-8000-000000000a02',
          activity_type_code: 'endurance_session',
          activity_type_name: 'Sesión de resistencia',
          discipline_code: 'endurance',
          started_at: '2026-09-14T11:00:00+00:00',
          ended_at: '2026-09-14T11:45:00+00:00',
          timezone: 'America/Bogota',
          status: 'completed',
          validation_status: 'pending',
          requested_level: 'summary',
          achieved_level: null,
          revision_number: 2,
          capture_source: 'device',
          contract: { id: '019c0000-0000-7000-8000-000000000032', version: 2 },
          segments: [{ position: 1, activity_type_code: 'endurance_session' }],
          strength_sets: [],
          endurance_laps: [
            {
              segment_position: 1,
              lap_number: 1,
              distance: { value: 1, unit: 'km' },
              duration_seconds: 330,
            },
            {
              segment_position: 1,
              lap_number: 2,
              distance: { value: 1, unit: 'km' },
              duration_seconds: 315,
            },
          ],
        },
      ],
      // HU-BO-008 c4: she hid the strength session from one gym.
      hiddenSessions: [
        {
          executed_session_id: '019a8000-0000-7000-8000-000000000a01',
          relationship_id: '019a8000-0000-7000-8000-000000000b01',
          organization_id: '019a8000-0000-7000-8000-000000000c01',
          organization_name: 'Gimnasio Uno',
          hidden_at: '2026-09-16T12:00:00+00:00',
        },
      ],
    },
  })
  await mockBackofficeApi(context, fixture)
  // A laptop screen: the sessions fit without scrolling sideways.
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer historial previo de entrenamiento' }).click()

  const outcome = page.locator('[data-break-glass-outcome]')
  await expect(outcome.getByText('Lectura autorizada y registrada')).toBeVisible()

  const sessions = page.getByRole('table', { name: 'Sesiones de entrenamiento de la persona' })
  const strength = sessions.getByRole('row', { name: /Sesión de fuerza/ })
  await expect(strength).toContainText('America/Bogota')
  await expect(strength).toContainText('1 h 15 min')
  await expect(strength).toContainText('2 series · 14 repeticiones · hasta 85 kg')
  await expect(strength).toContainText('Completada · sin validar')
  await expect(strength).toContainText('Sin nivel certificado')
  await expect(strength.locator('[data-break-glass-hidden-from]')).toHaveText(
    'Oculta a Gimnasio Uno',
  )
  const run = sessions.getByRole('row', { name: /Sesión de resistencia/ })
  await expect(run).toContainText('2 tramos · 2 km · 10:45')
  await expect(run.locator('[data-break-glass-hidden-from]')).toHaveCount(0)
  const region = page.getByRole('region', { name: 'Sesiones de entrenamiento de la persona' })
  expect(await region.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)

  const read = fixture.requests.filter((request) => request.path.endsWith('/reads'))
  expect(read[0]?.body).toEqual({
    category: 'prior_training_history',
    resource_type: 'execution.executed_sessions',
  })

  await page.getByRole('button', { name: 'Cerrar la ventana' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar ahora' }).click()
  await expect(page.getByText(/Ninguna lectura entrega contenido desde ahora/)).toBeVisible()
  await expect(sessions).toHaveCount(0)
})

test('a session opens to each thing it recorded, and the agenda names each programme', async ({
  context,
  page,
}) => {
  // HU-BO-008 c2 and c3: intervals, rounds and mobility were recorded and never shown, and
  // the agenda was not shown at all.
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: {
      files: [openBreakGlassWindow(10, { categories: ['prior_training_history'] })],
      sessions: [
        {
          id: '019a8000-0000-7000-8000-000000000a09',
          activity_type_code: 'strength_session',
          activity_type_name: 'Circuito',
          discipline_code: 'strength',
          started_at: '2026-09-15T12:00:00+00:00',
          ended_at: '2026-09-15T12:40:00+00:00',
          timezone: 'America/Bogota',
          status: 'completed',
          validation_status: 'pending',
          requested_level: 'detailed',
          achieved_level: null,
          revision_number: 1,
          capture_source: 'manual',
          contract: { id: '019c0000-0000-7000-8000-000000000031', version: 1 },
          segments: [],
          strength_sets: [],
          endurance_laps: [],
          interval_results: [
            {
              segment_position: null,
              interval_number: 1,
              work_duration_seconds: 40,
              rest_duration_seconds: 20,
              achieved_repetitions: null,
              distance: null,
              completed: false,
            },
          ],
          round_results: [
            {
              segment_position: null,
              round_number: 1,
              activity_family: 'strength',
              completed_repetitions: 12,
              duration_seconds: null,
              distance: null,
              load: null,
            },
          ],
          mobility_results: [
            {
              segment_position: null,
              sequence_position: 1,
              movement_id: null,
              movement_name: 'Apertura de cadera',
              side: 'left',
              hold_duration_seconds: 30,
              completed_repetitions: null,
            },
          ],
        },
      ],
      ownAgenda: [
        {
          scheduled_at: '2026-09-17T11:00:00+00:00',
          timezone: 'America/Bogota',
          status: 'scheduled',
          program_day: 2,
          program_title: 'Mi rutina de casa',
          from_gym: false,
        },
      ],
    },
  })
  await mockBackofficeApi(context, fixture)
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer historial previo de entrenamiento' }).click()

  const circuit = page.getByRole('row', { name: /Circuito/ })
  await expect(circuit).toContainText('1 intervalo · 1 ronda · 1 de movilidad')
  await circuit.getByText('Ver lo registrado').click()
  await expect(circuit).toContainText(
    'Intervalo 1 · 40 s de trabajo · 20 s de descanso · sin completar',
  )
  await expect(circuit).toContainText('Ronda 1 · fuerza · 12 repeticiones')
  await expect(circuit).toContainText('Movilidad 1 · Apertura de cadera · izquierda · 30 s')

  const agenda = page.getByRole('row', { name: /Mi rutina de casa/ })
  await expect(agenda).toContainText('Día 2')
  await expect(agenda).toContainText('Programada')
  await expect(agenda).toContainText('Programa propio')
})

test("a window over a gym's training shows what the gym planned", async ({ context, page }) => {
  // It used to answer that the platform held no data, although gyms assign programmes.
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: {
        files: [openBreakGlassWindow(10, { categories: ['relationship_training'] })],
        gymAgenda: [
          {
            scheduled_at: '2026-09-17T11:00:00+00:00',
            timezone: 'America/Bogota',
            status: 'scheduled',
            program_day: 3,
            program_title: 'Fuerza 8 semanas',
            from_gym: true,
          },
        ],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer entrenamiento de la relación' }).click()

  const outcome = page.locator('[data-break-glass-outcome]')
  await expect(outcome.getByText('Lectura autorizada y registrada')).toBeVisible()
  const agenda = page.getByRole('row', { name: /Fuerza 8 semanas/ })
  await expect(agenda).toContainText('Asignado por un gimnasio')
  await expect(outcome).not.toContainText('no tiene sesiones con un gimnasio')
})

test('an authorised read of someone who never trained says so', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: {
        files: [openBreakGlassWindow(10, { categories: ['prior_training_history'] })],
        sessions: [],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer historial previo de entrenamiento' }).click()

  await expect(
    page
      .locator('[data-break-glass-outcome]')
      .getByText(/La persona no tiene sesiones de entrenamiento registradas/),
  ).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'Sesiones de entrenamiento de la persona' }),
  ).toHaveCount(0)
})

test('a second read replaces what the first one showed', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: {
        files: [openBreakGlassWindow(10, { categories: ['body_progress', 'health_context'] })],
        healthContext: [SHOULDER],
        bodyProgress: [
          {
            id: '019a8000-0000-7000-8000-000000000704',
            metric_code: 'body_weight',
            value: 72,
            unit_code: 'kg',
            original_value: null,
            original_unit_code: null,
            measured_on: '2026-09-03',
            has_media: false,
            recorded_at: '2026-09-03T11:00:00.000Z',
          },
        ],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer contexto de salud' }).click()
  const claims = page.getByRole('table', { name: 'Contexto de salud de la persona' })
  await expect(claims).toBeVisible()

  // Only what the latest read returned is on screen, never two categories at once.
  await page.getByRole('button', { name: 'Leer progreso corporal' }).click()
  await expect(page.getByRole('table', { name: 'Mediciones de la persona' })).toBeVisible()
  await expect(claims).toHaveCount(0)
})

test('a read whose window lapses on screen stops showing what it returned', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: {
        // Six seconds: long enough to read, short enough to watch it lapse.
        files: [openBreakGlassWindow(0.1, { categories: ['body_progress'] })],
        bodyProgress: [
          {
            id: '019a8000-0000-7000-8000-000000000703',
            metric_code: 'hip',
            value: 0.95,
            unit_code: 'm',
            original_value: 95,
            original_unit_code: 'cm',
            measured_on: '2026-09-02',
            has_media: false,
            recorded_at: '2026-09-02T11:00:00.000Z',
          },
        ],
      },
    }),
  )

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer progreso corporal' }).click()
  const measurements = page.getByRole('table', { name: 'Mediciones de la persona' })
  await expect(measurements.getByRole('row', { name: /Cadera/ })).toBeVisible()

  // The window outlives the default five-second wait, so this one waits it out.
  await expect(page.getByText(/La ventana ya venció/)).toBeVisible({ timeout: 10_000 })
  await expect(measurements).toHaveCount(0)
  await expect(page.getByText(/dejó de mostrarse/)).toBeVisible()
})

test('a denied attempt is shown as a recorded fact rather than an error', async ({
  context,
  page,
}) => {
  // The screen never offers a read it knows will be refused, so the only way to a
  // denial is the race it cannot prevent: the duty is withdrawn between the answer
  // that offered the read and the click that took it.
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: {
      nextExerciseDenial: 'duty_not_effective',
      files: [openBreakGlassWindow(10, { categories: ['nutrition_guidance'] })],
    },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Leer guía nutricional' }).click()

  const outcome = page.locator('[data-break-glass-outcome]')
  await expect(outcome.getByText('Intento denegado y registrado')).toBeVisible()
  await expect(outcome.getByText(/Tu deber ya no está vigente/)).toBeVisible()
  await expect(outcome.getByText(/Quedó registrado el intento/)).toBeVisible()
  // Denied, and the counter of authorised exercises did not move.
  expect(fixture.breakGlass?.files[0]?.exercise_count).toBe(0)
})

test('a window that lapses on screen stops offering the read by itself', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      // Three seconds, so the countdown runs out while the operator is looking at it.
      breakGlass: { files: [openBreakGlassWindow(0.05, { categories: ['nutrition_guidance'] })] },
    }),
  )

  await page.goto(PATH)
  await expect(page.getByRole('button', { name: 'Leer guía nutricional' })).toBeVisible()

  // No interaction and no reload: the window closes itself, because there is no
  // extension to offer instead.
  await expect(page.getByText(/La ventana ya venció/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leer guía nutricional' })).toHaveCount(0)
  await expect(page.getByText(/Ninguna lectura entrega contenido/)).toBeVisible()
})

test('closing a window is final and leaves nothing to read', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: { files: [openBreakGlassWindow(10, { categories: ['nutrition_guidance'] })] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Cerrar la ventana' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar ahora' }).click()

  await expect(page.getByText(/Ninguna lectura entrega contenido desde ahora/)).toBeVisible()
  await expect(page.getByText('Cerrada', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leer guía nutricional' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cerrar la ventana' })).toHaveCount(0)
})

test('leaving the window open from the close dialog closes nothing', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    breakGlass: { files: [openBreakGlassWindow(10, { categories: ['nutrition_guidance'] })] },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)
  await page.getByRole('button', { name: 'Cerrar la ventana' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('No se puede reabrir ni extender')
  await dialog.getByRole('button', { name: 'Dejarla abierta' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText('Ventana abierta')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leer guía nutricional' })).toBeVisible()
  expect(fixture.requests.filter((request) => request.path.endsWith('/closure'))).toHaveLength(0)
  expect(fixture.breakGlass?.files[0]?.status).toBe('approved')
})

test('a file that is not yours offers no way to exercise it', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: {
        files: [
          openBreakGlassWindow(10, {
            requester_person_id: BREAK_GLASS_PEER_ID,
            categories: ['nutrition_guidance'],
            viewer_is_requester: false,
          }),
        ],
      },
    }),
  )

  await page.goto(PATH)

  await expect(page.getByText('Ventana abierta')).toBeVisible()
  await expect(page.getByRole('button', { name: /Leer / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cerrar la ventana' })).toHaveCount(0)
})

test('a withdrawn duty is explained as expiry by design, not as an error', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      breakGlass: { refusal: { status: 403, code: 'forbidden' }, files: [] },
    }),
  )

  await page.goto(PATH)

  await expect(page.getByText('Esta pantalla pide un deber vigente')).toBeVisible()
  await expect(page.getByText(/llegan con el rol de administrador/)).toBeVisible()
})

test('an empty tray says what will appear rather than nothing at all', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), breakGlass: { files: [] } }),
  )

  await page.goto(PATH)

  await expect(page.getByText('No hay expedientes')).toBeVisible()
  await expect(page.getByText(/con el tiempo que les queda y cuántas veces se/)).toBeVisible()
})

// The subject was typed as an identifier; the person's card now starts the request.
test("a request started from the person's card arrives with the subject and the case", async ({
  context,
  page,
}) => {
  const subject = '019a8000-0000-7000-8000-000000000006'
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), breakGlass: { files: [] } }),
  )

  await page.goto(`/break-glass?subject=${subject}&case_reference=CASE-2026-321`)

  await expect(page.getByLabel('Persona afectada')).toHaveValue(subject)
  await expect(page.getByLabel('Referencia del caso')).toHaveValue('CASE-2026-321')
})
