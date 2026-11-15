import { expect, test, type Page } from '@playwright/test'

import {
  activeSession,
  createBackofficeFixture,
  mockBackofficeApi,
  waitlistSignup,
  type BackofficeFixture,
  type WaitlistSignupFixture,
} from './backoffice-api-mock'

/**
 * `HU-BO-035` — reviewing the Allfit Space waitlist.
 *
 * What is asserted is what the screen has to say out loud: a channel with its own name
 * rather than the stored value, a discard told apart from a fraud mark, what a mark
 * will do to this sign-up before it is made, what taking it back returns and what it
 * does not, and that a lost answer never acts twice.
 */

const PATH = '/waitlist'
const SIGNUPS = '/backoffice/v1/waitlist/signups'

/**
 * Ana invited Bruno, Carla and Darío. Bruno holds number 2; Elena confirmed after the
 * numbers given here and waits for one.
 */
function list(): WaitlistSignupFixture[] {
  const ana = waitlistSignup({
    name: 'Ana Ruiz',
    email: 'ana.ruiz@example.com',
    referral_code: 'ANAR2Q7M',
    founding_number: 1,
    referrals_sharing_connection: 2,
  })
  const bruno = waitlistSignup({
    name: 'Bruno Díaz',
    email: 'bruno.diaz@example.com',
    referral_code: 'BRUN7QHX',
    founding_number: 2,
    source: 'instagram',
    invited_by_id: ana.id,
  })
  const carla = waitlistSignup({
    name: 'Carla Gil',
    email: 'carla.gil@example.com',
    referral_code: 'CARL4T9P',
    founding_number: 3,
    invited_by_id: ana.id,
  })
  const dario = waitlistSignup({
    name: 'Darío Paz',
    email: 'dario.paz@example.com',
    referral_code: 'DARI8K2V',
    invited_by_id: ana.id,
    discard_reason: 'same_device',
  })
  const elena = waitlistSignup({
    name: 'Elena Mora',
    email: 'elena.mora@example.com',
    referral_code: 'ELEN5W3D',
    source: 'tiktok',
  })
  const fabio = waitlistSignup({
    name: 'Fabio Lara',
    email: 'fabio.lara@example.com',
    referral_code: 'FABI6H1N',
    confirmed_at: null,
  })
  return [ana, bruno, carla, dario, elena, fabio]
}

/** The row of the person named, not every row that mentions them as an inviter. */
function row(page: Page, name: string) {
  return page
    .locator('[data-waitlist-row]')
    .filter({ has: page.locator('[data-waitlist-person] strong', { hasText: name }) })
}

/** The same list after Bruno was marked: his number 2 went to Darío. */
function listWithBrunoMarked(): WaitlistSignupFixture[] {
  const signups = list()
  const bruno = signups.find((signup) => signup.name === 'Bruno Díaz')
  const dario = signups.find((signup) => signup.name === 'Darío Paz')
  if (!bruno || !dario) throw new Error('the list changed')
  bruno.discard_reason = 'fraud'
  bruno.founding_number = null
  bruno.fraud = {
    reason: 'Correos en serie desde un mismo equipo',
    marked_at: '2026-11-14T18:00:00.000Z',
    previous_discard_reason: null,
  }
  dario.founding_number = 2
  return signups
}

function lastListQuery(fixture: BackofficeFixture): string | undefined {
  return fixture.requests.filter((request) => request.path === SIGNUPS).at(-1)?.query
}

test('reads the totals of the whole list and each sign-up, newest first', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    waitlist: { signups: list() },
  })
  await mockBackofficeApi(context, fixture)

  await page.goto(PATH)

  await expect(page.locator('[data-waitlist-figure="signups"] [data-waitlist-value]')).toHaveText(
    '6',
  )
  await expect(page.locator('[data-waitlist-figure="confirmed"] [data-waitlist-value]')).toHaveText(
    '5',
  )
  await expect(page.locator('[data-waitlist-figure="confirmed"]')).toContainText(
    '83 % de los inscritos.',
  )
  await expect(
    page.locator('[data-waitlist-figure="founding_members"] [data-waitlist-value]'),
  ).toHaveText('3 de 100')
  await expect(page.locator('[data-waitlist-figure="founding_members"]')).toContainText(
    'Quedan 97 números libres.',
  )

  const rows = page.locator('[data-waitlist-row]')
  await expect(rows).toHaveCount(6)
  await expect(rows.first()).toContainText('Fabio Lara')
  await expect(rows.last()).toContainText('Ana Ruiz')
  await expect(
    page.getByText('6 inscripciones, de la más reciente a la más antigua.'),
  ).toBeVisible()

  await expect(row(page, 'Bruno Díaz')).toContainText('bruno.diaz@example.com')
  await expect(row(page, 'Bruno Díaz')).toContainText('BRUN7QHX')
  await expect(row(page, 'Bruno Díaz').locator('[data-waitlist-founding]')).toHaveText(
    'Founding Member N.º 2',
  )
  await expect(row(page, 'Fabio Lara')).toContainText('Sin confirmar')
  await expect(row(page, 'Fabio Lara').locator('[data-waitlist-founding]')).toHaveCount(0)

  // No read carried a filter the operator never set.
  const reads = fixture.requests.filter((request) => request.path === SIGNUPS)
  expect(reads.length).toBeGreaterThan(0)
  expect(reads.every((request) => request.query === '')).toBe(true)
})

test('a channel reads with its own name, never as it is stored', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), waitlist: { signups: list() } }),
  )

  await page.goto(PATH)

  await expect(row(page, 'Bruno Díaz')).toContainText('Instagram')
  await expect(row(page, 'Bruno Díaz').locator('[data-waitlist-inviter]')).toContainText(
    'Invitó: Ana Ruiz',
  )
  await expect(row(page, 'Bruno Díaz').locator('[data-waitlist-inviter] code')).toHaveText(
    'ANAR2Q7M',
  )
  await expect(row(page, 'Elena Mora')).toContainText('TikTok')
  await expect(row(page, 'Carla Gil')).toContainText('Referido')
  await expect(row(page, 'Ana Ruiz')).toContainText('Directo')
  await expect(page.locator('[data-waitlist-review]')).not.toContainText('instagram')
  await expect(page.locator('[data-waitlist-review]')).not.toContainText('same_device')

  const channels = page.locator('[data-waitlist-channels] tbody tr')
  await expect(channels).toHaveCount(4)
  await expect(channels.filter({ hasText: 'Referido' })).toContainText('2')
  await expect(channels.filter({ hasText: 'Instagram' })).toContainText('1')
})

test('a discard made on joining and a shared connection are said, not accused', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), waitlist: { signups: list() } }),
  )

  await page.goto(PATH)

  await expect(row(page, 'Darío Paz')).toContainText('No cuenta')
  await expect(row(page, 'Darío Paz')).toContainText('Dispositivo repetido')
  await expect(row(page, 'Darío Paz')).not.toContainText('Fraude')
  // Bruno and Carla count; Darío was discarded on joining.
  await expect(row(page, 'Ana Ruiz').locator('[data-waitlist-referrals]')).toHaveText('2')
  await expect(row(page, 'Ana Ruiz').locator('[data-waitlist-shared]')).toHaveText(
    '2 comparten conexión',
  )
  await expect(row(page, 'Bruno Díaz').locator('[data-waitlist-shared]')).toHaveCount(0)
})

test('searches by email or code and narrows to what does not count', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    waitlist: { signups: list() },
  })
  await mockBackofficeApi(context, fixture)
  await page.goto(PATH)
  await expect(page.locator('[data-waitlist-row]')).toHaveCount(6)

  await page.getByLabel('Nombre, correo o código').fill('  carla.gil@  ')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.locator('[data-waitlist-row]')).toHaveCount(1)
  await expect(row(page, 'Carla Gil')).toBeVisible()
  expect(lastListQuery(fixture)).toBe('?q=carla.gil%40')

  await page.getByLabel('Nombre, correo o código').fill('eLen5w')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(row(page, 'Elena Mora')).toBeVisible()
  await expect(page.locator('[data-waitlist-row]')).toHaveCount(1)

  await page.getByLabel('Nombre, correo o código').fill('')
  await page.getByRole('combobox', { name: 'Mostrar' }).click()
  await page.getByRole('option', { name: 'No cuentan' }).click()
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.locator('[data-waitlist-row]')).toHaveCount(1)
  await expect(row(page, 'Darío Paz')).toBeVisible()
  expect(lastListQuery(fixture)).toBe('?filter=discarded')

  // The totals stay those of the whole list.
  await expect(page.locator('[data-waitlist-figure="signups"] [data-waitlist-value]')).toHaveText(
    '6',
  )
})

test('a search of one character is not sent', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    waitlist: { signups: list() },
  })
  await mockBackofficeApi(context, fixture)
  await page.goto(PATH)
  await expect(page.locator('[data-waitlist-row]')).toHaveCount(6)
  const before = fixture.requests.filter((request) => request.path === SIGNUPS).length

  await page.getByLabel('Nombre, correo o código').fill('a')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await expect(page.getByText('Escribe al menos dos caracteres')).toBeVisible()
  expect(fixture.requests.filter((request) => request.path === SIGNUPS)).toHaveLength(before)
})

test('says there are more and loads them', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      waitlist: { signups: list(), pageSize: 4 },
    }),
  )

  await page.goto(PATH)

  await expect(page.locator('[data-waitlist-row]')).toHaveCount(4)
  await expect(page.locator('[data-waitlist-answer]')).toContainText('Hay más')
  await page.getByRole('button', { name: 'Ver más inscripciones' }).click()
  await expect(page.locator('[data-waitlist-row]')).toHaveCount(6)
  await expect(page.getByRole('button', { name: 'Ver más inscripciones' })).toHaveCount(0)
})

test('each sign-up says whether it already has its account', async ({ context, page }) => {
  const signups = list()
  const elena = signups.find((signup) => signup.name === 'Elena Mora')
  if (!elena) throw new Error('the list changed')
  elena.has_space_account = true
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), waitlist: { signups } }),
  )
  await page.goto(PATH)

  await expect(page.getByRole('columnheader', { name: 'Con cuenta' })).toBeVisible()
  await expect(row(page, 'Bruno Díaz').locator('[data-waitlist-account]')).toHaveText('No')
  await expect(row(page, 'Elena Mora').locator('[data-waitlist-account]')).toHaveText('Sí')
})

test('marking fraud says what it will do, asks for the reason and reads the list again', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    waitlist: { signups: list() },
  })
  await mockBackofficeApi(context, fixture)
  await page.goto(PATH)

  await page
    .getByRole('button', { name: 'Marcar como fraude la inscripción de Bruno Díaz' })
    .click()
  const dialog = page.locator('[data-waitlist-fraud-dialog]')
  await expect(dialog).toContainText('Bruno Díaz · bruno.diaz@example.com')
  await expect(dialog).toContainText('Deja de sumar como referido de Ana Ruiz.')
  await expect(dialog).toContainText('Pierde el número 2 de Founding Member')
  await expect(dialog).toContainText('La marca se puede quitar después.')

  // Without a reason nothing is sent.
  await dialog.getByRole('button', { name: 'Marcar como fraude' }).click()
  await expect(dialog.locator('[data-waitlist-fraud-failure]')).toContainText(
    'Escribe el motivo en una línea',
  )
  expect(fixture.requests.filter((request) => request.method === 'POST')).toHaveLength(0)

  await dialog.getByLabel('Motivo').fill('  Correos en serie desde un mismo equipo ')
  await dialog.getByRole('button', { name: 'Marcar como fraude' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-waitlist-outcome]')).toContainText(
    'La inscripción de Bruno Díaz quedó marcada como fraude. Su número 2 quedó libre para la siguiente persona confirmada. Ya no suma como referido de Ana Ruiz.',
  )
  await expect(row(page, 'Bruno Díaz')).toContainText('Fraude')
  await expect(row(page, 'Bruno Díaz')).toContainText('Correos en serie desde un mismo equipo')
  await expect(row(page, 'Bruno Díaz').locator('[data-waitlist-founding]')).toHaveCount(0)
  await expect(
    row(page, 'Bruno Díaz').getByRole('button', { name: /Marcar como fraude/ }),
  ).toHaveCount(0)
  await expect(
    row(page, 'Bruno Díaz').getByRole('button', {
      name: 'Quitar la marca de fraude de la inscripción de Bruno Díaz',
    }),
  ).toBeVisible()
  // The number went to the earliest-confirmed sign-up that waited, and the inviter lost one.
  await expect(row(page, 'Darío Paz').locator('[data-waitlist-founding]')).toHaveText(
    'Founding Member N.º 2',
  )
  await expect(row(page, 'Ana Ruiz').locator('[data-waitlist-referrals]')).toHaveText('1')
  await expect(
    page.locator('[data-waitlist-figure="marked_as_fraud"] [data-waitlist-value]'),
  ).toHaveText('1')

  const commands = fixture.requests.filter((request) => request.method === 'POST')
  expect(commands).toHaveLength(1)
  expect(commands[0]?.path).toMatch(/\/backoffice\/v1\/waitlist\/signups\/[^/]+\/fraud$/)
  expect(commands[0]?.body).toEqual({ reason: 'Correos en serie desde un mismo equipo' })
  expect(commands[0]?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(commands[0]?.headers['command-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
})

test('a sign-up nobody invited and without a number is told what it loses', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), waitlist: { signups: list() } }),
  )
  await page.goto(PATH)

  await page
    .getByRole('button', { name: 'Marcar como fraude la inscripción de Elena Mora' })
    .click()
  const dialog = page.locator('[data-waitlist-fraud-dialog]')
  await expect(dialog).toContainText('No recibirá un número de Founding Member.')
  await expect(dialog).not.toContainText('referido de')

  await dialog.getByRole('button', { name: 'Dejarla como está' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, 'Elena Mora')).not.toContainText('Fraude')
})

test('a lost answer is retried with the same command, and marks once', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    waitlist: { signups: list(), loseNextMarkAnswer: true },
  })
  await mockBackofficeApi(context, fixture)
  await page.goto(PATH)

  await page.getByRole('button', { name: 'Marcar como fraude la inscripción de Carla Gil' }).click()
  const dialog = page.locator('[data-waitlist-fraud-dialog]')
  await dialog.getByLabel('Motivo').fill('Dirección de un servicio temporal')
  await dialog.getByRole('button', { name: 'Marcar como fraude' }).click()

  await expect(dialog.locator('[data-waitlist-fraud-failure]')).toContainText(
    'no se hará dos veces',
  )
  await dialog.getByRole('button', { name: 'Marcar como fraude' }).click()

  await expect(page.locator('[data-waitlist-outcome]')).toContainText('Carla Gil')
  await expect(row(page, 'Carla Gil')).toContainText('Dirección de un servicio temporal')
  const commands = fixture.requests.filter((request) => request.method === 'POST')
  expect(commands).toHaveLength(2)
  expect(commands[1]?.headers['idempotency-key']).toBe(commands[0]?.headers['idempotency-key'])
  expect(commands[1]?.headers['command-id']).toBe(commands[0]?.headers['command-id'])
})

test('a mark the server refuses stays in the dialog with what happened', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      waitlist: { signups: list(), markRefusal: { status: 409, code: 'conflict' } },
    }),
  )
  await page.goto(PATH)

  await page.getByRole('button', { name: 'Marcar como fraude la inscripción de Carla Gil' }).click()
  const dialog = page.locator('[data-waitlist-fraud-dialog]')
  await dialog.getByLabel('Motivo').fill('Dirección de un servicio temporal')
  await dialog.getByRole('button', { name: 'Marcar como fraude' }).click()

  await expect(dialog.locator('[data-waitlist-fraud-failure]')).toContainText(
    'ya estaba marcada como fraude',
  )
  await expect(page.locator('[data-waitlist-outcome]')).toHaveCount(0)
})

test('taking a mark back says what returns, asks for the reason and reads the list again', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    waitlist: { signups: listWithBrunoMarked() },
  })
  await mockBackofficeApi(context, fixture)
  await page.goto(PATH)

  await expect(row(page, 'Ana Ruiz').locator('[data-waitlist-referrals]')).toHaveText('1')
  await page
    .getByRole('button', { name: 'Quitar la marca de fraude de la inscripción de Bruno Díaz' })
    .click()
  const dialog = page.locator('[data-waitlist-fraud-dialog]')
  await expect(dialog.getByRole('heading', { name: 'Quitar la marca de fraude' })).toBeVisible()
  await expect(dialog).toContainText('Bruno Díaz · bruno.diaz@example.com')
  await expect(dialog).toContainText('Vuelve a sumar como referido de Ana Ruiz')
  await expect(dialog).toContainText('el que tenía antes de la marca no se le reserva')

  // Without a reason nothing is sent.
  await dialog.getByRole('button', { name: 'Quitar la marca' }).click()
  await expect(dialog.locator('[data-waitlist-fraud-failure]')).toContainText(
    'Escribe el motivo en una línea',
  )
  expect(fixture.requests.filter((request) => request.method === 'POST')).toHaveLength(0)

  await dialog.getByLabel('Motivo').fill('  La persona escribió y es real ')
  await dialog.getByRole('button', { name: 'Quitar la marca' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-waitlist-outcome]')).toContainText('Marca de fraude retirada')
  await expect(page.locator('[data-waitlist-outcome]')).toContainText(
    'Se quitó la marca de fraude de la inscripción de Bruno Díaz. Recibió el número 4 de Founding Member. Vuelve a sumar como referido de Ana Ruiz.',
  )
  await expect(row(page, 'Bruno Díaz')).toHaveAttribute('data-discard', 'none')
  await expect(row(page, 'Bruno Díaz').locator('[data-waitlist-fraud-withdrawal]')).toContainText(
    'Marca de fraude retirada: La persona escribió y es real',
  )
  await expect(
    row(page, 'Bruno Díaz').getByRole('button', {
      name: 'Marcar como fraude la inscripción de Bruno Díaz',
    }),
  ).toBeVisible()
  // The number it gave up stays with whoever received it; it takes the next one free.
  await expect(row(page, 'Bruno Díaz').locator('[data-waitlist-founding]')).toHaveText(
    'Founding Member N.º 4',
  )
  await expect(row(page, 'Darío Paz').locator('[data-waitlist-founding]')).toHaveText(
    'Founding Member N.º 2',
  )
  await expect(row(page, 'Ana Ruiz').locator('[data-waitlist-referrals]')).toHaveText('2')
  await expect(
    page.locator('[data-waitlist-figure="marked_as_fraud"] [data-waitlist-value]'),
  ).toHaveText('0')

  const commands = fixture.requests.filter((request) => request.method === 'POST')
  expect(commands).toHaveLength(1)
  expect(commands[0]?.path).toMatch(
    /\/backoffice\/v1\/waitlist\/signups\/[^/]+\/fraud\/withdrawal$/,
  )
  expect(commands[0]?.body).toEqual({ reason: 'La persona escribió y es real' })
  expect(commands[0]?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(commands[0]?.headers['command-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
})

test('a sign-up the list had discarded before its mark is told it still will not count', async ({
  context,
  page,
}) => {
  const signups = list()
  const dario = signups.find((signup) => signup.name === 'Darío Paz')
  if (!dario) throw new Error('the list changed')
  dario.discard_reason = 'fraud'
  dario.fraud = {
    reason: 'Mismo equipo que otra inscripción',
    marked_at: '2026-11-14T18:00:00.000Z',
    previous_discard_reason: 'same_device',
  }
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), waitlist: { signups } }),
  )
  await page.goto(PATH)

  await page
    .getByRole('button', { name: 'Quitar la marca de fraude de la inscripción de Darío Paz' })
    .click()
  const dialog = page.locator('[data-waitlist-fraud-dialog]')
  await expect(dialog).toContainText(
    'Sigue sin sumar como referido de Ana Ruiz: la lista la descartó al entrar (dispositivo repetido).',
  )

  await dialog.getByRole('button', { name: 'Dejarla marcada' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, 'Darío Paz')).toHaveAttribute('data-discard', 'fraud')
})

test('a lost answer of a withdrawal is retried with the same command, and acts once', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    waitlist: { signups: listWithBrunoMarked(), loseNextWithdrawalAnswer: true },
  })
  await mockBackofficeApi(context, fixture)
  await page.goto(PATH)

  await page
    .getByRole('button', { name: 'Quitar la marca de fraude de la inscripción de Bruno Díaz' })
    .click()
  const dialog = page.locator('[data-waitlist-fraud-dialog]')
  await dialog.getByLabel('Motivo').fill('La persona escribió y es real')
  await dialog.getByRole('button', { name: 'Quitar la marca' }).click()

  await expect(dialog.locator('[data-waitlist-fraud-failure]')).toContainText(
    'no se quitará dos veces',
  )
  await dialog.getByRole('button', { name: 'Quitar la marca' }).click()

  await expect(page.locator('[data-waitlist-outcome]')).toContainText('Bruno Díaz')
  await expect(row(page, 'Bruno Díaz')).toHaveAttribute('data-discard', 'none')
  const commands = fixture.requests.filter((request) => request.method === 'POST')
  expect(commands).toHaveLength(2)
  expect(commands[1]?.headers['idempotency-key']).toBe(commands[0]?.headers['idempotency-key'])
  expect(commands[1]?.headers['command-id']).toBe(commands[0]?.headers['command-id'])
})

test('a withdrawal the server refuses stays in the dialog with what happened', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      waitlist: {
        signups: listWithBrunoMarked(),
        withdrawalRefusal: { status: 409, code: 'conflict' },
      },
    }),
  )
  await page.goto(PATH)

  await page
    .getByRole('button', { name: 'Quitar la marca de fraude de la inscripción de Bruno Díaz' })
    .click()
  const dialog = page.locator('[data-waitlist-fraud-dialog]')
  await dialog.getByLabel('Motivo').fill('La persona escribió y es real')
  await dialog.getByRole('button', { name: 'Quitar la marca' }).click()

  await expect(dialog.locator('[data-waitlist-fraud-failure]')).toContainText(
    'ya no estaba marcada como fraude',
  )
  await expect(page.locator('[data-waitlist-outcome]')).toHaveCount(0)
})

test('without the commercial duty the screen is a closed door that names it', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      waitlist: { signups: list(), refusal: { status: 403, code: 'forbidden' } },
    }),
  )

  await page.goto(PATH)

  await expect(page.locator('[data-screen-refusal]')).toContainText(
    'administrar lo comercial de la plataforma',
  )
  await expect(page.locator('[data-screen-duties]')).toContainText(
    'Administrar lo comercial de la plataforma',
  )
  await expect(page.locator('[data-waitlist-row]')).toHaveCount(0)
  await expect(page.locator('[data-waitlist-totals]')).toHaveCount(0)
  await expect(page.getByLabel('Nombre, correo o código')).toHaveCount(0)
})

test('an empty list says nobody has joined', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), waitlist: { signups: [] } }),
  )

  await page.goto(PATH)

  await expect(page.getByText('Todavía no hay nadie en la lista de espera.')).toBeVisible()
  await expect(page.locator('[data-waitlist-figure="signups"] [data-waitlist-value]')).toHaveText(
    '0',
  )
})

test('the menu lists the waitlist and lights it', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), waitlist: { signups: list() } }),
  )

  await page.goto(PATH)

  await expect(page).toHaveTitle('Lista de espera | Allfit Backoffice')
  // The library marks the lit entry with a bare `data-active` attribute.
  await expect(
    page.locator('[data-backoffice-sidebar] a[data-active]:not([data-active="false"])'),
  ).toHaveText('Lista de espera')
})
