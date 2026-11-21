import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  activeSubscription,
  createStudioApiFixture,
  installStudioApiMock,
  organizationRoleCatalog,
  type StudioApiFixture,
} from './studio-api-mock'

function open(page: Page, organizationId: string) {
  return page.goto(`/organizations/${organizationId}/billing`)
}

/** What a subscription takes waits in its row's menu, so it is opened first. */
async function choose(page: Page, action: 'suspend' | 'reactivate' | 'end') {
  await page.locator('[data-billing-menu]').first().click()
  await page.locator(`[data-billing-action="${action}"]`).click()
}

function listReads(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'GET' && request.path.endsWith('/subscriptions'),
  )
}

/** One subscription in each state, which is what HU-STUDIO-078 criterion 1 reads. */
const everyState = [
  activeSubscription,
  {
    ...activeSubscription,
    subscription_id: '01991600-7000-7000-8000-000000000602',
    person_name: 'Bruno Bedoya',
    status: 'suspended',
    suspended_at: '2026-10-18T09:00:00.000Z',
  },
  {
    ...activeSubscription,
    subscription_id: '01991600-7000-7000-8000-000000000603',
    person_name: 'Carla Castro',
    status: 'ended',
    ended_at: '2026-10-19T09:00:00.000Z',
  },
]

/** The same catalogue with `manage_billing` taken off whatever role the caller holds. */
function withoutBilling() {
  return organizationRoleCatalog.map((role) =>
    typeof role === 'object' && role !== null && 'capabilities' in role
      ? {
          ...role,
          capabilities: (role.capabilities as Array<{ code: string }>).filter(
            (capability) => capability.code !== 'manage_billing',
          ),
        }
      : role,
  )
}

test('an owner reads who pays and what each one pays', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  const row = page.locator('[data-billing-row]')
  await expect(row).toContainText('Ana Álvarez')
  await expect(row).toContainText('Mensual')
  await expect(row).toContainText('Al día')
  /*
   * The assertion that stops a $120.000 plan reading as $12.000.000 on the screen where
   * somebody decides whether to suspend it. The API sends the minor unit.
   */
  await expect(row).toContainText('120.000')
  await expect(row).not.toContainText('12.000.000')
  // Null until the gateway reports a charge, and a dash would read as "today".
  await expect(row).toContainText('Sin cobro reportado')
})

test('HU-078 c1: who is paying, who is paused and who ended, each said', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationSubscriptions: everyState,
  })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  const rows = page.locator('[data-billing-row]')
  await expect(rows.filter({ hasText: 'Ana Álvarez' })).toContainText('Al día')
  await expect(rows.filter({ hasText: 'Bruno Bedoya' })).toContainText('En pausa')
  await expect(rows.filter({ hasText: 'Carla Castro' })).toContainText('Terminada')
  // A paused plan says since when and an ended one when, where the others say their charge.
  await expect(rows.filter({ hasText: 'Bruno Bedoya' })).toContainText('Desde el 18 oct 2026')
  await expect(rows.filter({ hasText: 'Carla Castro' })).toContainText('El 19 oct 2026')
  // The plan and what it costs are two facts, so they read as two lines, not one word.
  await expect(rows.first().locator('[data-billing-amount]')).toHaveCSS('display', 'block')
})

/*
 * The figures over the list are counted from the list itself, so they cannot
 * disagree with it: one in each state, and only the active plan adds to the month.
 */
test('the figures over the list count each state and what the active plans add up to', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationSubscriptions: everyState,
  })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  const figure = (name: string) => page.locator(`[data-billing-figure="${name}"] dd`)
  await expect(figure('active')).toHaveText('1')
  await expect(figure('suspended')).toHaveText('1')
  await expect(figure('ended')).toHaveText('1')
  await expect(figure('monthly')).toHaveText(/^\$\s?120\.000$/)
})

/*
 * HU-078 criterion 3, pinned rather than read, as the authorizations register does: the
 * day somebody adds a useful column carrying a session, a weight or a goal, this fails.
 */
test('HU-078 c3: the register carries payment columns and nothing else', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  await expect(page.locator('[data-billing-row]').first()).toBeVisible()
  const heads = page.locator('[data-billing-panel] thead th')
  // Compared lowercased: the Design System uppercases a header through CSS.
  const headers = await heads.allInnerTexts()
  // The last column holds each row's menu: it shows no word and is named for a screen reader.
  expect(headers.map((header) => header.toLocaleLowerCase('es'))).toEqual([
    'persona',
    'plan',
    'estado',
    'cobro',
    '',
  ])
  await expect(heads.last()).toHaveAttribute('aria-label', 'Acciones')
})

test('HU-078 c3: on a phone the cards carry the same facts and no other', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  const card = page.locator('[data-billing-card]').first()
  await expect(card).toBeVisible()
  // Every word the card shows, in order: whose it is, the plan and its price, how it stands.
  const words = (await card.innerText())
    .split('\n')
    .map((line) => line.trim().toLocaleLowerCase('es'))
    .filter(Boolean)
  expect(words).toHaveLength(5)
  expect(words[0]).toBe('aá')
  expect(words[1]).toBe('ana álvarez')
  expect(words[2]).toMatch(/^mensual · \$\s?120\.000 al mes$/)
  expect(words[3]).toBe('al día')
  expect(words[4]).toBe('sin cobro reportado')
})

/*
 * HU-078 criterion 2 with the two roles it names, rather than a catalogue without the
 * capability: neither reaches the tab, and the screen never asks for the list.
 */
for (const role of ['coach', 'staff']) {
  test(`HU-078 c2: ${role} never reaches who pays, even by asking`, async ({ page }) => {
    const fixture = createStudioApiFixture({
      memberships: [{ ...activeMembership, roles: [role] }],
    })
    await installStudioApiMock(page, fixture)
    await open(page, activeMembership.organization_id)

    await expect(page.getByText('Las suscripciones no son de tu rol')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Suscripciones' })).toHaveCount(0)
    await expect(page.locator('[data-billing-row]')).toHaveCount(0)
    expect(listReads(fixture)).toHaveLength(0)
  })
}

test('the screen says Allfit never holds the card', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  await expect(page.locator('[data-billing-page]')).toContainText('nunca guarda datos de tarjeta')
})

test('pausing a plan moves it and never offers to pause it twice', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  await choose(page, 'suspend')
  await page.getByRole('button', { name: 'Pausar y avisar' }).click()

  await expect(page.locator('[data-billing-row]')).toContainText('En pausa')
  await expect(page.getByRole('dialog')).toBeHidden()
  // The answer is said where the reader is looking, without a page to dismiss.
  await expect(page.getByText('El plan de Ana Álvarez quedó en pausa.')).toBeVisible()
  // A paused plan takes reactivate or end; pausing again would be a 409.
  // The menu that was used is gone before the next one is read, not still fading.
  await expect(page.getByRole('menu')).toHaveCount(0)
  await page.locator('[data-billing-menu]').click()
  await expect(page.locator('[data-billing-action="reactivate"]')).toBeVisible()
  await expect(page.locator('[data-billing-action="end"]')).toBeVisible()
  await expect(page.locator('[data-billing-action="suspend"]')).toHaveCount(0)

  const command = fixture.requests.find(
    (request) => request.method === 'POST' && request.path.endsWith('/suspension'),
  )
  expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(command?.headers['command-id']).toMatch(/^[0-9a-f-]{36}$/)
})

/*
 * The confirmation's reason to exist. An administrator pausing somebody for non-payment
 * will reasonably fear that it takes the client's data away, and will either avoid the
 * action or use it believing it does something the platform deliberately does not do.
 * So each sentence is asserted under the heading it belongs to: which half it sits in
 * is part of what it says.
 */
test('HU-079: pausing says what it stops, what it leaves alone, and the email', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)
  await choose(page, 'suspend')

  const dialog = page.getByRole('dialog')
  const happens = dialog.locator('[data-billing-consequence="happens"]')
  const stays = dialog.locator('[data-billing-consequence="stays"]')
  await expect(happens.getByRole('heading')).toHaveText('Qué pasa')
  await expect(stays.getByRole('heading')).toHaveText('Qué no cambia')
  // Criterion 2, what stops.
  await expect(happens).toContainText('no puede registrar ni cambiar nada')
  await expect(happens).toContainText('las sesiones futuras del programa que le asignaron')
  // Criterion 1, what does not.
  await expect(stays).toContainText('No se le quita ningún permiso')
  await expect(stays).toContainText('su programa sigue asignado')
  await expect(stays).toContainText('la relación con la organización sigue igual')
  // Criterion 3.
  await expect(stays).toContainText('puede seguir entrenando por su cuenta')
  await expect(dialog).toContainText('avisar por correo')
  // Criterion 5: pausing must not promise that reactivating brings everything back.
  await expect(dialog).not.toContainText('todo vuelve')
})

test('HU-079: reactivating restores nothing that changed, and says what comes back', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationSubscriptions: [{ ...activeSubscription, status: 'suspended' }],
  })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)
  await choose(page, 'reactivate')

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Levanta solo la pausa de este plan')
  await expect(dialog).toContainText('No devuelve las cosas a como estaban')
  await expect(dialog.locator('[data-billing-consequence="stays"]')).toContainText(
    'Lo que cambió durante la pausa no vuelve',
  )
  await expect(dialog.locator('[data-billing-consequence="happens"]')).toContainText(
    'Vuelven las sesiones futuras que no se hayan iniciado',
  )
  await expect(dialog).toContainText('mientras su permiso siga vigente')
  await expect(dialog).not.toContainText('como siempre')
  await page.getByRole('button', { name: 'Reactivar y avisar' }).click()

  await expect(page.locator('[data-billing-row]')).toContainText('Al día')
  await expect(page.getByText('El plan de Ana Álvarez volvió a estar al día.')).toBeVisible()
})

test('HU-080: ending says what closes and what stays standing, and leaves no action', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  await choose(page, 'end')
  const dialog = page.getByRole('dialog')
  // Criterion 1: the paying bond closes, the relationship stays.
  await expect(dialog).toContainText('Cierra el cobro de este plan')
  await expect(dialog).toContainText('terminar el plan no termina la relación')
  await expect(dialog).toContainText('Para terminar la relación hay otra acción')
  // Criterion 2.
  await expect(dialog).toContainText('Queda registrado que lo decidiste tú')
  // The dialog renders text: markdown would reach the reader as asterisks.
  await expect(dialog).not.toContainText('**')
  await expect(dialog).not.toContainText('levanta la pausa')
  await page.getByRole('button', { name: 'Terminar y avisar' }).click()

  await expect(page.locator('[data-billing-row]')).toContainText('Terminada')
  await expect(page.getByText('El plan de Ana Álvarez terminó.')).toBeVisible()
  // An ended subscription takes nothing, so its row has no menu at all. A menu with
  // nothing enabled would only invite the reader to look for a reason that does not exist.
  await expect(page.locator('[data-billing-menu]')).toHaveCount(0)
})

test('HU-080: ending a paused plan says the pause lifts with it', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationSubscriptions: [{ ...activeSubscription, status: 'suspended' }],
  })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  await choose(page, 'end')
  await expect(page.getByRole('dialog')).toContainText('terminar también levanta la pausa')
})

test('HU-080 c3: pausing says a pause never turns into an ending by itself', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  await choose(page, 'suspend')
  await expect(page.getByRole('dialog')).toContainText('nunca se convierte sola en terminación')
})

test('a reactivation with no open cause is not described as something to retry', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationSubscriptions: [{ ...activeSubscription, status: 'suspended' }],
    subscriptionOutcome: 'no-cause',
  })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  await choose(page, 'reactivate')
  await page.getByRole('button', { name: 'Reactivar y avisar' }).click()

  const failure = page.locator('[data-billing-error]')
  await expect(failure).toContainText('no tiene una causa abierta que cerrar')
  await expect(failure).toContainText('no un reintento')
})

/*
 * The list is read whole, because the figures over it and the count beside each state
 * are counted from it. So choosing a state shows that state without asking again: a
 * second read could answer something the figures no longer agree with.
 */
test('filtering by state shows that state, from the list already read', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationSubscriptions: [
      activeSubscription,
      {
        ...activeSubscription,
        subscription_id: '01991600-7000-7000-8000-000000000602',
        person_name: 'Bruno Bedoya',
        status: 'suspended',
        suspended_at: '2026-10-18T09:00:00.000Z',
      },
    ],
  })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  await expect(page.locator('[data-billing-row]')).toHaveCount(2)
  const reads = listReads(fixture).length
  await page.getByRole('button', { name: 'En pausa' }).click()

  await expect(page.locator('[data-billing-row]')).toHaveCount(1)
  await expect(page.locator('[data-billing-row]')).toContainText('Bruno Bedoya')
  expect(listReads(fixture)).toHaveLength(reads)
  // Each state says how many it holds, before it is chosen.
  await expect(page.getByRole('button', { name: 'En pausa' })).toContainText('1')
  await expect(page.getByRole('button', { name: 'Todas' })).toContainText('2')
})

test('a person is found by name, whatever its capitals and accents', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationSubscriptions: everyState,
  })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  const rows = page.locator('[data-billing-row]')
  await expect(rows).toHaveCount(3)
  await page.getByLabel('Buscar persona').fill('ALVAREZ')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('Ana Álvarez')

  // Nobody by that name: the screen says so and offers the way back to everybody.
  await page.getByLabel('Buscar persona').fill('zzz')
  await expect(page.getByText('Ninguna persona coincide')).toBeVisible()
  await page.getByRole('button', { name: 'Quitar los filtros' }).click()
  await expect(rows).toHaveCount(3)
})

/*
 * A coach with that client assigned reads the same answer as a stranger. The payment state
 * of a person is not a training fact, and the screen says why rather than only refusing.
 * The page itself is no longer closed: its plans are the whole team's (HU-STUDIO-077), so
 * what this role is refused is the subscriptions tab, and that is what is asserted.
 */
test('a role without manage_billing is told why, and asks for nothing', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationRoles: withoutBilling(),
  })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  await expect(page.getByText('Las suscripciones no son de tu rol')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Suscripciones' })).toHaveCount(0)
  await expect(page.locator('[data-billing-page]')).toContainText('no es un dato de entrenamiento')
  expect(listReads(fixture)).toHaveLength(0)
})

test('an empty list says where a subscription comes from, because it is not from here', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationSubscriptions: [],
  })
  await installStudioApiMock(page, fixture)
  await open(page, activeMembership.organization_id)

  await expect(page.locator('[data-billing-page]')).toContainText('Todavía nadie paga aquí')
  await expect(page.locator('[data-billing-page]')).toContainText(
    'Las personas se suscriben desde la app',
  )
})

test('the sidebar reaches the screen and the header names it', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(`/organizations/${activeMembership.organization_id}`)

  await page.getByRole('link', { name: 'Cobros' }).click()

  await expect(page).toHaveURL(
    new RegExp(`/organizations/${activeMembership.organization_id}/billing$`),
  )
  await expect(page.getByRole('heading', { name: 'Cobros' })).toBeVisible()
})
