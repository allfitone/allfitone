import { expect, test } from '@playwright/test'

import {
  clientCard,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
  relationshipAssignments,
} from './studio-api-mock'

/**
 * HU-STUDIO-050 — stopping a program the organization manages.
 *
 * Its three criteria are mostly the server's, and what is checked here is the
 * half the screen owns: that the action is offered only where it can succeed,
 * that the dialog says both consequences before the click, that what comes back
 * is reported from the answer's own figure, and that the card **stays** —
 * because the third criterion is that the assignment does not leave her
 * history, and a card that vanished would show the opposite.
 *
 * The simulator writes what the command writes: it stops the stoppable sessions
 * and closes the assignment, so the re-read after the click shows the real
 * consequence instead of a success message over unchanged rows.
 */

const ORG = holderMembership.organization_id
const PERSON = clientCard.person_id
const PROGRAMS = `/organizations/${ORG}/clients/people/${PERSON}/programs`

const CONSEQUENCE = 'Se detienen las sesiones de hoy en adelante que ella no haya empezado.'
const HISTORY_STAYS =
  'Lo que ya entrenó y las sesiones pasadas quedan intactas, y el programa sigue en su historial.'

test.beforeEach(async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [holderMembership] }))
})

/*
 * Two of the three programs in the fixture can be stopped. The third ended and
 * the organization no longer manages it, which the contract answers 409 — so
 * offering the action there would be offering a refusal.
 */
test('offers the action only on the programs the organization still manages', async ({ page }) => {
  await page.goto(PROGRAMS)

  await expect(page.getByRole('heading', { level: 1, name: 'Programas asignados' })).toBeVisible()
  await expect(page.locator('[data-client-program]')).toHaveCount(3)
  await expect(page.locator('[data-client-program-cancel]')).toHaveCount(2)

  const ended = page.locator('[data-client-program]').nth(2)
  await expect(ended).toContainText('Terminado')
  await expect(ended.locator('[data-client-program-cancel]')).toHaveCount(0)
})

test('says what stops and what stays before the click, and that it cannot be undone', async ({
  page,
}) => {
  await page.goto(PROGRAMS)
  await page
    .locator('[data-client-program]')
    .first()
    .getByRole('button', { name: 'Cancelar este programa' })
    .click()

  const dialog = page.locator('[data-client-program-cancel-dialog]')
  await expect(dialog).toContainText('¿Cancelar «Fuerza general · bloque de otoño», versión 3?')
  await expect(dialog).toContainText('No se puede deshacer')
  await expect(dialog).toContainText(CONSEQUENCE)
  await expect(dialog).toContainText(HISTORY_STAYS)
  await expect(dialog).toContainText('Una sesión que ya empezó no se detiene.')
})

test('keeping it active changes nothing', async ({ page }) => {
  await page.goto(PROGRAMS)
  const program = page.locator('[data-client-program]').first()
  await program.getByRole('button', { name: 'Cancelar este programa' }).click()
  await page.getByRole('button', { name: 'Dejarlo activo' }).click()

  await expect(page.locator('[data-client-program-cancel-dialog]')).toHaveCount(0)
  await expect(program).toContainText('En curso')
  await expect(program.locator('[data-client-program-cancel-outcome]')).toHaveText('')
})

/**
 * The whole story in one pass. The first program has six sessions: two she
 * finished, one already cancelled, one she started, one scheduled and one
 * paused — so exactly **one** can be stopped, and the sentence has to say one
 * and not six.
 */
test('stops only what could be stopped, and says how many from the answer', async ({ page }) => {
  await page.goto(PROGRAMS)
  const program = page.locator('[data-client-program]').first()
  await program.getByRole('button', { name: 'Cancelar este programa' }).click()
  await page.getByRole('button', { name: 'Cancelar ahora' }).click()

  await expect(program.locator('[data-client-program-cancel-outcome]')).toHaveText(
    'Cancelado. Se detuvo 1 sesión futura.',
  )
  // Criterion 3: the program is still here, now in its new state.
  await expect(page.locator('[data-client-program]')).toHaveCount(3)
  await expect(program.locator('[data-client-program-status]')).toHaveText('Cancelado')
  /*
   * The button is gone, because there is nothing left to stop — but the block
   * that held it stays, because the sentence saying what happened belongs where
   * the reader was looking when they pressed it.
   */
  await expect(program.getByRole('button', { name: 'Cancelar este programa' })).toHaveCount(0)
  await expect(program.locator('[data-client-program-cancel]')).toHaveCount(1)
})

/*
 * Criteria 1 and 2 as they land on the calendar, which is the only place a
 * reader can check them. The two she finished and the one she started keep
 * their state; the scheduled one is the single row that changed.
 */
test('leaves the finished and the started sessions as they were', async ({ page }) => {
  await page.goto(PROGRAMS)
  const program = page.locator('[data-client-program]').first()
  const states = program.locator('[data-client-program-session]')
  await expect(states).toHaveCount(6)

  await program.getByRole('button', { name: 'Cancelar este programa' }).click()
  await page.getByRole('button', { name: 'Cancelar ahora' }).click()
  await expect(program).toContainText('Cancelado')

  await expect(states).toHaveCount(6)
  await expect(states.nth(0)).toContainText('Hecha')
  await expect(states.nth(1)).toContainText('Hecha')
  // The one she started: scheduled before, and still not stopped.
  await expect(states.nth(3)).toContainText('Programada')
  await expect(states.nth(4)).toContainText('Cancelada')
  await expect(states.nth(5)).toContainText('En pausa')
})

/*
 * The refusal worth its own sentence. The contract says a paused service is
 * resolved by reactivating it or ending the relationship and never program by
 * program, so "vuelve a intentarlo" would send the coach nowhere.
 */
test('a paused service says where it is resolved, which is not here', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      cancelAssignmentOutcome: 'service-paused',
    }),
  )
  await page.goto(PROGRAMS)
  await page
    .locator('[data-client-program]')
    .first()
    .getByRole('button', { name: 'Cancelar este programa' })
    .click()
  await page.getByRole('button', { name: 'Cancelar ahora' }).click()

  const failure = page.locator('[data-client-program-cancel-error]')
  await expect(failure).toContainText('reactivándolo o terminando el vínculo')
  await expect(failure).toContainText('no programa por programa')
  // The dialog stays open over the failure, and nothing was stopped.
  await expect(page.locator('[data-client-program-cancel-dialog]')).toBeVisible()
  await expect(page.locator('[data-client-program]').first()).toContainText('En curso')
})

/*
 * The other 409, whose advice is the opposite of the paused one: nobody here
 * can stop a program the organization no longer manages, so the sentence must
 * not send the coach to reactivate anything.
 */
test('a program the organization no longer manages says nobody here can stop it', async ({
  page,
}) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      cancelAssignmentOutcome: 'conflict',
    }),
  )
  await page.goto(PROGRAMS)
  await page
    .locator('[data-client-program]')
    .first()
    .getByRole('button', { name: 'Cancelar este programa' })
    .click()
  await page.getByRole('button', { name: 'Cancelar ahora' }).click()

  const failure = page.locator('[data-client-program-cancel-error]')
  await expect(failure).toContainText('ya no lo administramos')
  await expect(failure).not.toContainText('reactiv')
})

/*
 * A program still managed whose sessions all already happened. Nothing to stop
 * is not a failure, and «0 sesiones» would invite the reader to wonder what
 * went wrong — so that case says it in words.
 */
test('says nothing was pending rather than reporting zero sessions', async ({ page }) => {
  const nothingPending = [
    {
      ...relationshipAssignments[0],
      sessions: (relationshipAssignments[0]?.sessions ?? []).map((session) => ({
        ...session,
        status: 'completed',
        started: true,
      })),
    },
  ]
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      relationshipAssignments: nothingPending,
    }),
  )
  await page.goto(PROGRAMS)
  const program = page.locator('[data-client-program]').first()
  await program.getByRole('button', { name: 'Cancelar este programa' }).click()
  await page.getByRole('button', { name: 'Cancelar ahora' }).click()

  await expect(program.locator('[data-client-program-cancel-outcome]')).toHaveText(
    'Cancelado. No quedaban sesiones futuras por detener.',
  )
})

test('a refusal by role or permission offers no retry and keeps the program running', async ({
  page,
}) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      cancelAssignmentOutcome: 'forbidden',
    }),
  )
  await page.goto(PROGRAMS)
  await page
    .locator('[data-client-program]')
    .first()
    .getByRole('button', { name: 'Cancelar este programa' })
    .click()
  await page.getByRole('button', { name: 'Cancelar ahora' }).click()

  await expect(page.locator('[data-client-program-cancel-error]')).toContainText(
    'tu rol o el permiso de entrenamiento no alcanzan',
  )
  await expect(page.locator('[data-client-program]').first()).toContainText('En curso')
})

/*
 * She shared her training only to read. The screen decides before asking, so
 * the action is not offered at all — and the reason is already on screen,
 * because the same permission governs assigning.
 */
test('is not offered at all when she shared her training only to read', async ({ page }) => {
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

  await expect(page.getByRole('heading', { level: 1, name: 'Programas asignados' })).toBeVisible()
  await expect(page.locator('[data-client-program-cancel]')).toHaveCount(0)
  // The reason is already on screen: the same permission governs assigning.
  await expect(page.locator('[data-client-programs-cannot-assign]')).toContainText(
    'solo para leerlo',
  )
})
