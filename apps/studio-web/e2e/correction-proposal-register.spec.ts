import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  holderMembership,
  installStudioApiMock,
  proposedCorrections,
} from './studio-api-mock'

/**
 * HU-STUDIO-060 — the register of corrections one proposed.
 *
 * The other half of HU-STUDIO-059: there a coach proposes, here he finds out
 * what came of it. The story turns on three things the screen must not get
 * wrong. **The state is the server's word** — a proposal past its thirty days
 * reads expired whether or not a sweep has marked it, so the screen never
 * derives a state from a date. **Expiring is not a refusal**, and the two sit
 * next to each other. And **if she accepts, the value stays hers**: he is
 * recorded as who proposed it.
 */

const ORG = holderMembership.organization_id
const REGISTER = `/organizations/${ORG}/clients?tab=proposals`

async function open(page: Page, fixture?: unknown) {
  await installStudioApiMock(
    page,
    (fixture as ReturnType<typeof createStudioApiFixture>) ??
      createStudioApiFixture({
        memberships: [holderMembership],
        proposedCorrections: structuredClone(proposedCorrections),
      }),
  )
  await page.goto(REGISTER)
  // The heading is the screen's — «Clientes» — since the four sections became
  // its tabs, so what says this one is open is the tab itself.
  await expect(page.getByRole('tab', { name: 'Propuestas' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
}

/** Six states as six buttons did not fit a narrow screen; it is a picker now. */
async function filterProposals(page: Page, option: string) {
  await page.getByRole('combobox', { name: 'Estado de las propuestas' }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

/* Criterion 1: the state and the deadline of each one. */
test('lists every state, soonest to expire first', async ({ page }) => {
  await open(page)

  const rows = page.locator('[data-correction-proposal]')
  await expect(rows).toHaveCount(5)
  /*
   * Soonest to expire first, which is the operation's order and not the
   * states': the two already closed in October come before the two settled
   * later, and the one still waiting expires in 2027, so it is last.
   */
  await expect(page.locator('[data-correction-proposal-status]')).toHaveText([
    'Venció sin respuesta',
    'Cancelada',
    'La aceptó',
    'La rechazó',
    'Esperando su respuesta',
  ])
})

/*
 * The state is computed by the server. This proposal's stored status says
 * `pending` and its date has passed, so it must read as expired — and the
 * screen must not be the thing that decided that.
 */
test('one past its date reads as expired, not as waiting', async ({ page }) => {
  await open(page)

  const expired = page
    .locator('[data-correction-proposal]')
    .filter({ hasText: 'Me parece que fueron dos.' })
  await expect(expired.locator('[data-correction-proposal-status]')).toHaveText(
    'Venció sin respuesta',
  )
  // And expiring is not a no from her: the two are one click apart on this screen.
  await expect(expired).toContainText('no es un «no» suyo')
})

/* Criterion 3: the value stays hers, and he is who proposed it. */
test('an accepted one says the value is still hers', async ({ page }) => {
  await open(page)

  const accepted = page.locator('[data-correction-proposal]').filter({ hasText: 'La barra pesaba' })
  await expect(accepted.locator('[data-correction-proposal-status]')).toHaveText('La aceptó')
  await expect(accepted).toContainText('sigue siendo suyo')
  await expect(accepted).toContainText('quien lo propuso')
})

test('a rejected one offers nothing to retry', async ({ page }) => {
  await open(page)

  const rejected = page
    .locator('[data-correction-proposal]')
    .filter({ hasText: 'Se veía más cómoda' })
  await expect(rejected.locator('[data-correction-proposal-status]')).toHaveText('La rechazó')
  await expect(rejected).toContainText('Es su decisión')
})

/*
 * Criterion 2, and the privacy rule inside it: a cancelled one says why, and
 * for a session that is no longer there it never says whether she annulled it
 * or hid it.
 */
test('a cancelled one says why, without saying what she decided', async ({ page }) => {
  await open(page)

  const cancelled = page
    .locator('[data-correction-proposal]')
    .filter({ hasText: 'Creo que subió a 70' })
  await expect(cancelled.locator('[data-correction-proposal-cancel]')).toContainText(
    'no se informa',
  )
  await expect(cancelled).not.toContainText('anuló')
  await expect(cancelled).not.toContainText('ocultó')
})

test('one it can no longer reach offers no link, and says so', async ({ page }) => {
  await open(page)

  const unreachable = page
    .locator('[data-correction-proposal]')
    .filter({ hasText: 'Creo que subió a 70' })
  await expect(unreachable.locator('[data-correction-proposal-session]')).toHaveCount(0)
  await expect(unreachable.locator('[data-correction-proposal-unreachable]')).toContainText(
    'Ya no puedes abrir esa sesión',
  )
})

test('one it still reaches opens its session', async ({ page }) => {
  await open(page)

  const waiting = page
    .locator('[data-correction-proposal]')
    .filter({ hasText: 'Conté nueve repeticiones' })
  await waiting.locator('[data-correction-proposal-session]').click()
  await expect(page.getByRole('heading', { name: 'Resultado de la sesión' })).toBeVisible()
})

/*
 * The filter asks the server, and the server computes the state: asking for
 * «Esperando» must leave out the one whose date has passed.
 */
test('the filter asks the server, so an expired one is not «esperando»', async ({ page }) => {
  await open(page)

  await filterProposals(page, 'Esperando')
  const rows = page.locator('[data-correction-proposal]')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Conté nueve repeticiones')

  await filterProposals(page, 'Vencidas')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Me parece que fueron dos.')
})

test('a filter with nothing in it speaks of that filter', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [holderMembership], proposedCorrections: [] }),
  )

  await expect(page.locator('[data-correction-proposal-empty]')).toContainText(
    'Todavía no has propuesto',
  )
  await filterProposals(page, 'Aceptadas')
  await expect(page.locator('[data-correction-proposal-empty]')).toContainText(
    'No tienes propuestas aceptadas',
  )
})

/* The register holds none of her data, so the only refusal is his membership. */
test('a refusal talks about his membership and not about her', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({
      memberships: [holderMembership],
      proposalRegisterOutcome: 'forbidden',
    }),
  )

  const failure = page.locator('[data-correction-proposal-failure]')
  await expect(failure).toContainText('membresía')
  await expect(failure).not.toContainText('permiso')
})

/* An admin who proposes nothing sees an empty register, not everyone's. */
test('each professional sees only their own', async ({ page }) => {
  await open(
    page,
    createStudioApiFixture({ memberships: [activeMembership], proposedCorrections: [] }),
  )

  await expect(page.locator('[data-correction-proposal-empty]')).toBeVisible()
})

/*
 * Reaching this section from the directory is covered once, with the other
 * three, in `client-header-actions.spec.ts`. It lived here while this was a
 * page of its own; against a tab strip it would be the same click twice.
 */
