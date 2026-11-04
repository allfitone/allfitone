import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  activeTeamMember,
  createStudioApiFixture,
  installStudioApiMock,
  secondActiveMembership,
  terminatedTeamMember,
} from './studio-api-mock'

/** Two roles, so revoking one leaves something to say about the other. */
const COACH_AND_ADMIN = {
  membership_id: '01991600-7000-7000-8000-000000000004',
  display_name: 'Sara Posada',
  status: 'active',
  joined_at: '2025-05-20T10:00:00.000Z',
  ended_at: null,
  roles: ['coach', 'admin'],
}

/** One role, and not coach: the branch where nobody is being attended. */
const STAFF_ONLY = {
  membership_id: '01991600-7000-7000-8000-000000000006',
  display_name: 'Tomás Gil',
  status: 'active',
  joined_at: '2025-06-01T10:00:00.000Z',
  ended_at: null,
  roles: ['staff'],
}

function team() {
  return [activeTeamMember, COACH_AND_ADMIN, STAFF_ONLY, terminatedTeamMember]
}

async function openRevokeDialog(page: Page, member: string) {
  await page.getByRole('button', { name: `Acciones sobre ${member}` }).click()
  await page.getByRole('menuitem', { name: 'Retirar rol' }).click()
}

function openTeam(page: Page, organizationId: string) {
  return page.goto(`/organizations/${organizationId}/team`)
}

test('an owner revokes a role and the list stops showing it', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openRevokeDialog(page, 'Sara Posada')
  await page.getByRole('combobox', { name: 'Rol' }).click()
  await page.getByRole('option', { name: 'Administrador' }).click()
  await page.getByRole('button', { name: 'Retirar rol' }).click()

  await expect(page.getByRole('alertdialog')).toBeHidden()
  const row = page.getByRole('row').filter({ hasText: 'Sara Posada' })
  await expect(row).not.toContainText('Administrador')
  // The other role is untouched, which is the half a careless re-read loses.
  await expect(row).toContainText('Coach')

  const command = fixture.requests.find((request) => request.method === 'DELETE')
  expect(command?.path).toMatch(/\/memberships\/[^/]+\/roles\/admin$/)
  expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
})

/*
 * Criterion 2. The consequence nobody guesses: the clients go, what they
 * authorized stays, and giving the role back does not bring them back — the
 * assignment rows are closed, not hidden.
 */
test('revoking coach warns that the clients go and do not come back', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openRevokeDialog(page, 'Sara Posada')
  await page.getByRole('combobox', { name: 'Rol' }).click()
  await page.getByRole('option', { name: 'Coach' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('dejan de estar a su cargo')
  await expect(dialog).toContainText('sigue en pie')
  await expect(dialog).toContainText('no se las devuelve')
})

/*
 * Criterion 3, and the reason the sentence is computed rather than written
 * once: taking admin away from somebody who is still a coach does **not** end
 * a single assignment, and saying it would send an owner looking for clients
 * to reassign that never moved.
 */
test('revoking admin promises the clients stay when the person is still a coach', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openRevokeDialog(page, 'Sara Posada')
  await page.getByRole('combobox', { name: 'Rol' }).click()
  await page.getByRole('option', { name: 'Administrador' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Sigue siendo coach')
  await expect(dialog).not.toContainText('dejan de estar a su cargo')
})

test('a person who attends nobody is told that no access changes', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openRevokeDialog(page, 'Tomás Gil')
  await page.getByRole('combobox', { name: 'Rol' }).click()
  await page.getByRole('option', { name: 'Staff' }).click()

  await expect(page.getByRole('alertdialog')).toContainText('No atiende a nadie')
})

// Criterion 4, and the first thing the dialog says.
test('the dialog says the permission is lost at once', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openRevokeDialog(page, 'Sara Posada')

  await expect(page.getByRole('alertdialog')).toContainText('se pierde en el acto')
})

/*
 * Criterion 1. Owner is not a choice here and cannot be: the contract's path
 * parameter spells admin, coach and staff and nothing else.
 */
test('owner is never offered as a role to revoke', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    // `activeTeamMember` is the owner in the fixture, and also an admin, so
    // the menu is offered and the picker has something in it.
    organizationMemberships: [{ ...activeTeamMember, roles: ['owner', 'admin'] }, STAFF_ONLY],
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openRevokeDialog(page, activeTeamMember.display_name)
  await page.getByRole('combobox', { name: 'Rol' }).click()

  await expect(page.getByRole('option', { name: 'Administrador' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Propietario' })).toBeHidden()
})

test('a role the person does not hold is not offered', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openRevokeDialog(page, 'Tomás Gil')
  await page.getByRole('combobox', { name: 'Rol' }).click()

  await expect(page.getByRole('option', { name: 'Staff' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Coach' })).toBeHidden()
})

/*
 * A refusal keeps the dialog open and tells the reader to re-read, because the
 * screen is showing a picture from before somebody else acted.
 */
test('a role already gone is reported without closing the dialog', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  fixture.roleRevokeOutcome = 'gone'
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openRevokeDialog(page, 'Sara Posada')
  await page.getByRole('combobox', { name: 'Rol' }).click()
  await page.getByRole('option', { name: 'Administrador' }).click()
  await page.getByRole('button', { name: 'Retirar rol' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Ese rol ya no estaba')
  await expect(dialog).toContainText('Actualiza la lista')
})

test('a coach is offered no actions at all', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [secondActiveMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, secondActiveMembership.organization_id)

  await expect(page.getByRole('button', { name: /^Acciones sobre/ })).toBeHidden()
})
