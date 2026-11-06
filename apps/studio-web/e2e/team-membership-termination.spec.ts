import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  activeTeamMember,
  createStudioApiFixture,
  installStudioApiMock,
  secondActiveMembership,
  terminatedTeamMember,
} from './studio-api-mock'

/** A coach, so ending the membership leaves clients without a professional. */
const COACH = {
  membership_id: '01991600-7000-7000-8000-000000000004',
  display_name: 'Sara Posada',
  status: 'active',
  joined_at: '2025-05-20T10:00:00.000Z',
  ended_at: null,
  roles: ['coach'],
}

/** Not a coach: the branch where nobody is left unattended. */
const STAFF = {
  membership_id: '01991600-7000-7000-8000-000000000006',
  display_name: 'Tomás Gil',
  status: 'active',
  joined_at: '2025-06-01T10:00:00.000Z',
  ended_at: null,
  roles: ['staff'],
}

function team() {
  return [activeTeamMember, COACH, STAFF, terminatedTeamMember]
}

async function openTerminationDialog(page: Page, member: string) {
  await page.getByRole('button', { name: `Acciones sobre ${member}` }).click()
  await page.getByRole('menuitem', { name: 'Dar de baja' }).click()
}

function openTeam(page: Page, organizationId: string) {
  return page.goto(`/organizations/${organizationId}/team`)
}

test('an owner ends a membership and the list says it ended', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openTerminationDialog(page, 'Sara Posada')
  await page.getByRole('button', { name: 'Dar de baja ahora' }).click()

  await expect(page.getByRole('alertdialog')).toBeHidden()
  const row = page.getByRole('row').filter({ hasText: 'Sara Posada' })
  await expect(row).toContainText('Terminado')

  const command = fixture.requests.find(
    (request) => request.method === 'POST' && request.path.endsWith('/termination'),
  )
  expect(command?.path).toMatch(/\/memberships\/[^/]+\/termination$/)
  expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  // The contract says the request has no body, and sending one would be the
  // kind of thing an intermediary drops without telling anybody.
  expect(command?.body).toBeUndefined()
})

/*
 * Criterion 2, and the whole reason this dialog exists. Somebody ending a
 * coach's membership assumes the clients leave with them, or that nothing else
 * happens. What happens is that the clients stay and lose their professional.
 */
test('ending a coach warns that the clients stay and need reassigning', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openTerminationDialog(page, 'Sara Posada')

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('siguen siendo clientes del gimnasio')
  await expect(dialog).toContainText('sin profesional responsable')
  await expect(dialog).toContainText('reasignarlas')
  // The half that stops an administrator fearing the wrong thing.
  await expect(dialog).toContainText('No se termina ninguna relación ni se revoca ningún permiso')
})

test('ending a staff member mentions no clients at all', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openTerminationDialog(page, 'Tomás Gil')

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('No atiende a nadie')
  await expect(dialog).not.toContainText('reasignarlas')
})

// Criterion 3, said second because it answers the worry the first sentence creates.
test('the dialog says the work the person wrote is kept', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openTerminationDialog(page, 'Sara Posada')

  await expect(page.getByRole('alertdialog')).toContainText('Lo que escribió se conserva')
})

/*
 * Criterion 4. The command raises 22023 for the owner, which arrives as a 422
 * the reader cannot interpret, so the action is never offered.
 */
test('the owner is offered no way to be given de baja', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: [{ ...activeTeamMember, roles: ['owner', 'admin'] }, COACH],
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await page
    .getByRole('button', { name: `Acciones sobre ${activeTeamMember.display_name}` })
    .click()

  // The menu opens — the owner can still be given a role — and the one item
  // that is absent is this one.
  await expect(page.getByRole('menuitem', { name: 'Retirar rol' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Dar de baja' })).toBeHidden()
})

/*
 * Not in the story, and in the function: `own membership is left by
 * resignation`. Leaving is OP-ORG-010, which is HU-STUDIO-022.
 */
test('you are never offered to give yourself de baja', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    // The signed-in reader's own membership id, drawn as a row like any other.
    organizationMemberships: [
      { ...COACH, membership_id: activeMembership.membership_id, display_name: 'Ada Lovelace' },
      STAFF,
    ],
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await page.getByRole('button', { name: 'Acciones sobre Ada Lovelace' }).click()

  await expect(page.getByRole('menuitem', { name: 'Retirar rol' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Dar de baja' })).toBeHidden()
})

test('a membership that already ended is offered nothing', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await expect(
    page.getByRole('button', { name: `Acciones sobre ${terminatedTeamMember.display_name}` }),
  ).toBeHidden()
})

/*
 * The capability split, end to end. `manage_roles` and `manage_memberships`
 * are separate entries in the server's catalogue, and the screen gates each
 * action on its own — a single gate would be invisible for an owner who holds
 * both, and wrong for a role that holds one.
 */
test('a reader who may end memberships but not change roles sees only that', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  fixture.organizationRoles = [
    {
      code: 'owner',
      name: 'Propietario',
      description: null,
      capabilities: [
        {
          code: 'manage_memberships',
          name: 'Administrar membresías del equipo',
          description: null,
        },
        { code: 'view_directory', name: 'Consultar directorios', description: null },
      ],
    },
  ]
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await page.getByRole('button', { name: 'Acciones sobre Sara Posada' }).click()

  await expect(page.getByRole('menuitem', { name: 'Dar de baja' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Añadir rol' })).toBeHidden()
  await expect(page.getByRole('menuitem', { name: 'Retirar rol' })).toBeHidden()
})

test('a refusal keeps the dialog open and asks for a re-read', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: team(),
  })
  fixture.membershipTerminationOutcome = 'rejected'
  await installStudioApiMock(page, fixture)
  await openTeam(page, activeMembership.organization_id)

  await openTerminationDialog(page, 'Sara Posada')
  await page.getByRole('button', { name: 'Dar de baja ahora' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Esta membresía no se puede dar de baja')
  await expect(dialog).toContainText('transferirle la propiedad')
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
