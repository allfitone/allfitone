import { expect, test } from '@playwright/test'

import {
  SUPPORT_SUBJECT_EMAIL,
  SUPPORT_SUBJECT_ID,
  SUPPORT_SUBJECT_NAME,
  activeSession,
  createBackofficeFixture,
  mockBackofficeApi,
  personPaymentsRecord,
  supportPerson,
} from './backoffice-api-mock'

const CASE = 'CASE-2026-001'

function support(overrides: Parameters<typeof supportPerson>[0] = {}) {
  return { people: [supportPerson(overrides)] }
}

test('finds a person by part of her name, without a case, and opens her file', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ session: activeSession(), support: support() })
  await mockBackofficeApi(context, fixture)

  await page.goto('/people')
  await page.getByLabel('Nombre, correo o teléfono').fill('epsi')
  await page.getByRole('button', { name: 'Buscar' }).click()

  // ADR-046: her name and full contact, so two similar names can be told apart.
  await expect(page.locator('[data-list-count]')).toHaveText('1 persona encontrada')
  const row = page.locator('[data-support-result]')
  await expect(row).toContainText(SUPPORT_SUBJECT_NAME)
  await expect(row).toContainText(SUPPORT_SUBJECT_EMAIL)
  await expect(row).toContainText('+573001234567')
  // Her account's state in words, never the database's `active`.
  await expect(row.getByRole('cell').last()).toHaveText('Activa')

  await row.getByRole('link', { name: SUPPORT_SUBJECT_NAME }).click()

  await expect(page).toHaveURL(`/people/${SUPPORT_SUBJECT_ID}`)
  await expect(page.getByRole('heading', { name: SUPPORT_SUBJECT_NAME, level: 2 })).toBeVisible()
  await expect(page.locator('#person-name')).toHaveText(SUPPORT_SUBJECT_NAME)
  await expect(page.locator('#person-email')).toHaveText(SUPPORT_SUBJECT_EMAIL)
  await expect(page.locator('#person-phone')).toHaveText('+573001234567')

  const searches = fixture.requests.filter((request) => request.path.endsWith('/support/people'))
  expect(searches.map((request) => request.query)).toEqual(['?q=epsi'])
})

test('going back from her file shows the same people, without searching again', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ session: activeSession(), support: support() })
  await mockBackofficeApi(context, fixture)

  await page.goto('/people')
  await page.getByLabel('Nombre, correo o teléfono').fill('epsi')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: SUPPORT_SUBJECT_NAME }).click()
  await expect(page).toHaveURL(`/people/${SUPPORT_SUBJECT_ID}`)

  // Back by the browser, then by the trail: the list is the one she left.
  await page.goBack()
  await expect(page.locator('[data-list-count]')).toHaveText('1 persona encontrada')
  await expect(page.getByLabel('Nombre, correo o teléfono')).toHaveValue('epsi')
  await page.getByRole('link', { name: SUPPORT_SUBJECT_NAME }).click()
  await page
    .getByRole('navigation', { name: 'Ruta' })
    .getByRole('link', { name: 'Personas' })
    .click()
  await expect(page.locator('[data-support-result]')).toContainText(SUPPORT_SUBJECT_NAME)

  // Every search is recorded on everyone it finds, so coming back never searches again;
  // and the address never carries what was typed, which would reach history and logs.
  const searches = fixture.requests.filter((request) => request.path.endsWith('/support/people'))
  expect(searches).toHaveLength(1)
  await expect(page).toHaveURL('/people')
})

test('a search made under a case comes back only under that case', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), support: support() }),
  )

  await page.goto('/people')
  await page.getByLabel('Nombre, correo o teléfono').fill('3001234')
  await page.getByLabel('Referencia del caso (opcional)').fill(CASE)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: SUPPORT_SUBJECT_NAME }).click()

  await page
    .getByRole('navigation', { name: 'Ruta' })
    .getByRole('link', { name: 'Personas' })
    .click()
  await expect(page).toHaveURL(`/people?case_reference=${CASE}`)
  await expect(page.locator('[data-support-result]')).toContainText(SUPPORT_SUBJECT_NAME)

  // From the menu there is no case, so a list recorded under one is not offered as if it were.
  await page.locator('[data-backoffice-sidebar]').getByRole('link', { name: 'Personas' }).click()
  await expect(page).toHaveURL('/people')
  await expect(page.locator('[data-support-results]')).toHaveCount(0)
  await expect(page.getByLabel('Referencia del caso (opcional)')).toHaveValue('')
})

test('a case, when there is one, travels with the search and into the file', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ session: activeSession(), support: support() })
  await mockBackofficeApi(context, fixture)

  await page.goto('/people')
  await page.getByLabel('Nombre, correo o teléfono').fill('3001234')
  await page.getByLabel('Referencia del caso (opcional)').fill(CASE)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: SUPPORT_SUBJECT_NAME }).click()

  await expect(page).toHaveURL(`/people/${SUPPORT_SUBJECT_ID}?case_reference=${CASE}`)
  await expect(page.getByRole('heading', { name: SUPPORT_SUBJECT_NAME, level: 2 })).toBeVisible()
  // A window for this person starts here, under the same case, instead of from a typed identifier.
  await expect(page.locator('[data-person-break-glass-link]')).toHaveAttribute(
    'href',
    `/break-glass?subject=${SUPPORT_SUBJECT_ID}&case_reference=${CASE}`,
  )

  // The card read is effect-driven and StrictMode double-invokes effects in dev, so
  // its count is not asserted: what matters is that every support read carries the case.
  const reads = fixture.requests.filter((request) =>
    request.path.startsWith('/backoffice/v1/support/'),
  )
  expect(reads.filter((request) => request.path.endsWith('/support/people'))).toHaveLength(1)
  expect(reads.every((request) => request.query.includes(`case_reference=${CASE}`))).toBe(true)
})

// LUX-POSTEL-01: a key typed in lowercase was refused although the screen could write it.
test('a case typed in lowercase is taken, and travels in capitals', async ({ context, page }) => {
  const fixture = createBackofficeFixture({ session: activeSession(), support: support() })
  await mockBackofficeApi(context, fixture)

  await page.goto('/people')
  await page.getByLabel('Nombre, correo o teléfono').fill('epsi')
  await page.getByLabel('Referencia del caso (opcional)').fill(` ${CASE.toLowerCase()} `)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: SUPPORT_SUBJECT_NAME }).click()

  await expect(page).toHaveURL(`/people/${SUPPORT_SUBJECT_ID}?case_reference=${CASE}`)
  const reads = fixture.requests.filter((request) =>
    request.path.startsWith('/backoffice/v1/support/'),
  )
  expect(reads.length).toBeGreaterThan(0)
  expect(reads.every((request) => request.query.includes(`case_reference=${CASE}`))).toBe(true)
})

test('says nobody matched rather than showing an empty result', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), support: support() }),
  )

  await page.goto('/people')
  await page.getByLabel('Nombre, correo o teléfono').fill('nadie')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await expect(page.getByText('Nadie coincide con «nadie»')).toBeVisible()
  await expect(page.getByText(/quedó registrada de todos modos/)).toBeVisible()
  await expect(page.locator('[data-support-results]')).toHaveCount(0)
})

test('says when more people match than the page shows', async ({ context, page }) => {
  const people = Array.from({ length: 26 }, (_unused, index) =>
    supportPerson({
      person_id: `019a5000-0000-7000-8000-${String(100 + index).padStart(12, '0')}`,
      display_name: `Gómez ${String(index).padStart(2, '0')}`,
      contact_email: `gomez${String(index)}@example.test`,
    }),
  )
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), support: { people } }),
  )

  await page.goto('/people')
  await page.getByLabel('Nombre, correo o teléfono').fill('gómez')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await expect(page.locator('[data-list-count]')).toHaveText('25 personas encontradas')
  await expect(page.locator('[data-support-result]')).toHaveCount(25)
  await expect(page.getByText(/Hay más personas que coinciden/)).toBeVisible()
})

test('refuses one character, or a case in free text, before it becomes a recorded search', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ session: activeSession(), support: support() })
  await mockBackofficeApi(context, fixture)

  await page.goto('/people')
  const term = page.getByLabel('Nombre, correo o teléfono')
  const reference = page.getByLabel('Referencia del caso (opcional)')
  await term.fill('e')
  await page.getByRole('button', { name: 'Buscar' }).click()
  // Each message sits under the field it is about, which says it is wrong.
  await expect(term).toHaveAttribute('aria-invalid', 'true')
  await expect(term).toHaveAccessibleDescription(/al menos dos caracteres/)
  await expect(reference).not.toHaveAttribute('aria-invalid', 'true')

  await term.fill('epsi')
  await reference.fill('el usuario no puede entrar')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(reference).toHaveAttribute('aria-invalid', 'true')
  await expect(reference).toHaveAccessibleDescription(
    /La referencia del caso va como CASE-2026-001/,
  )
  await expect(term).not.toHaveAttribute('aria-invalid', 'true')

  expect(
    fixture.requests.filter((request) => request.path.startsWith('/backoffice/v1/support/')),
  ).toHaveLength(0)
})

test('says what exists around the person, with states and dates, never which gym', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), support: support() }),
  )

  await page.goto(`/people/${SUPPORT_SUBJECT_ID}?case_reference=${CASE}`)

  // HU-BO-007 criterion 2: relationships, plan, Pro and permissions, by state and date.
  const blocks = page.locator('[data-support-person-blocks]')
  await expect(
    blocks.getByRole('heading', { name: 'Lo que existe alrededor de la persona' }),
  ).toBeVisible()
  await expect(blocks).toContainText('Entrena en 1 · dejó 1')
  await expect(blocks).toContainText('2 vigentes · 1 retirado')
  await expect(blocks).toContainText('Gratis · nunca se suscribió')
  await expect(blocks).toContainText('Sí, se lo da un gimnasio mientras siga en él')
  await expect(page.getByText('Allfit no lo guarda todavía')).toHaveCount(0)
})

test('a file the server sent without its blocks reads as unknown, never as none', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      support: support({
        relationships: undefined,
        permissions: undefined,
        plan: undefined,
        pro: undefined,
      }),
    }),
  )

  await page.goto(`/people/${SUPPORT_SUBJECT_ID}?case_reference=${CASE}`)

  // HU-BO-007 criterion 5: the file loads, and what it was not told is not a zero.
  const blocks = page.locator('[data-support-person-blocks]')
  await expect(blocks.getByText('Sin dato')).toHaveCount(4)
  await expect(blocks).not.toContainText('Nunca ha estado en un gimnasio')
})

test('shows what she pays, telling the charge that failed from the one that did not', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), support: support() }),
  )

  await page.goto(`/people/${SUPPORT_SUBJECT_ID}?case_reference=${CASE}`)
  await page.getByRole('tab', { name: 'Pagos' }).click()

  const panel = page.locator('[data-payments-panel]')
  await expect(panel.getByText(/Tiene Pro porque se lo paga a Allfit One por Apple/)).toBeVisible()
  // The amount is read from the ISO minor unit: 1.990.000 centavos are $19.900.
  await expect(panel.locator('[data-payments-charge]').first()).toContainText('19.900')
  await expect(panel.getByText('Cobrado', { exact: true })).toBeVisible()
  await expect(panel.getByText('No se cobró', { exact: true })).toBeVisible()
  await expect(panel.getByText(/motivo: billing_retry/)).toBeVisible()

  // Criterion 4, said out loud because its honesty is the point.
  await expect(panel.getByText(/no guarda datos de tarjeta/)).toBeVisible()

  // And what the gym charges, which Allfit does not record.
  await expect(panel.locator('[data-payments-bond]')).toContainText('Gimnasio Pagos')
  await expect(panel.locator('[data-payments-gym-note]')).toContainText('no guardamos los cobros')
})

test('a suspended subscription says since when, which is what a complaint needs', async ({
  context,
  page,
}) => {
  const live = personPaymentsRecord()
  const paused = personPaymentsRecord({
    pro: {
      ...live.pro,
      subscription: live.pro.subscription && {
        ...live.pro.subscription,
        status: 'suspended',
        suspended_at: '2026-10-05T12:00:00.000Z',
      },
    },
  })
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      support: support(),
      supportPayments: { payments: paused },
    }),
  )

  // An address can open the payments tab directly, as «Cobros por seguir» does.
  await page.goto(`/people/${SUPPORT_SUBJECT_ID}?case_reference=${CASE}&tab=payments`)

  await expect(page.locator('[data-payments-state="suspended"]')).toContainText(
    'En pausa por falta de cobro desde el',
  )
})

test('the duty that opens the card does not open her money, and the panel says which one does', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      support: support(),
      supportPayments: { refusal: { status: 403, code: 'forbidden' } },
    }),
  )

  await page.goto(`/people/${SUPPORT_SUBJECT_ID}?case_reference=${CASE}`)

  // The card still loads: one duty refused is not the whole screen failing.
  await expect(page.getByRole('heading', { name: SUPPORT_SUBJECT_NAME, level: 2 })).toBeVisible()
  await page.getByRole('tab', { name: 'Pagos' }).click()
  const refused = page.locator('[data-payments-refused]')
  await expect(refused).toContainText('view_billing_metadata')
  await expect(refused).toContainText('distinto del que abre su ficha')
})

test('opening her file reads her state; payments and recovery only when their tab opens', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ session: activeSession(), support: support() })
  await mockBackofficeApi(context, fixture)
  const reads = (suffix: string) =>
    fixture.requests.filter((request) => request.method === 'GET' && request.path.endsWith(suffix))
      .length

  await page.goto(`/people/${SUPPORT_SUBJECT_ID}?case_reference=${CASE}`)
  await expect(page.getByRole('heading', { name: SUPPORT_SUBJECT_NAME, level: 2 })).toBeVisible()
  await expect(page.locator('#person-email')).toBeVisible()
  // Every read is recorded on her, so what nobody opened is not read.
  expect(reads('/payments')).toBe(0)
  expect(reads('/account-recovery')).toBe(0)

  await page.getByRole('tab', { name: 'Pagos' }).click()
  await expect(page).toHaveURL(`/people/${SUPPORT_SUBJECT_ID}?case_reference=${CASE}&tab=payments`)
  await expect(page.locator('[data-payments-panel]')).toBeVisible()
  const payments = reads('/payments')
  expect(payments).toBeGreaterThan(0)

  // Going back and forth keeps what was read on screen instead of reading it again.
  await page.getByRole('tab', { name: 'Estado' }).click()
  await expect(page.locator('#person-email')).toBeVisible()
  await page.getByRole('tab', { name: 'Pagos' }).click()
  await expect(page.locator('[data-payments-panel]')).toBeVisible()
  expect(reads('/payments')).toBe(payments)
  expect(reads('/account-recovery')).toBe(0)
})

test('will not open a card under a case written in free text', async ({ context, page }) => {
  const fixture = createBackofficeFixture({ session: activeSession(), support: support() })
  await mockBackofficeApi(context, fixture)

  await page.goto(`/people/${SUPPORT_SUBJECT_ID}?case_reference=sin%20caso`)

  await expect(page.getByText('La referencia del caso no tiene la forma esperada')).toBeVisible()
  expect(
    fixture.requests.filter((request) => request.path.startsWith('/backoffice/v1/support/')),
  ).toHaveLength(0)
})

test('explains a refused read as an expired duty, not as a generic error', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      support: { people: [], refusal: { status: 403, code: 'forbidden' } },
    }),
  )

  await page.goto(`/people/${SUPPORT_SUBJECT_ID}?case_reference=${CASE}`)

  await expect(page.getByText(/llegan con el rol de administrador/)).toBeVisible()
})

test('sends an unauthenticated operator back to the access screen', async ({ context, page }) => {
  await mockBackofficeApi(context, createBackofficeFixture())

  await page.goto('/people')

  await expect(page.getByRole('heading', { name: 'Identifica tu acceso.' })).toBeVisible()
})
