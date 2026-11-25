import { expect, test } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  secondActiveMembership,
} from './studio-api-mock'

test('owner proposes a staff invitation without exposing contact in the URL', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  // Issuing an invitation starts from the team directory. The workspace home
  // reports the organization's state and links to the section that acts.
  await page.goto(`/organizations/${activeMembership.organization_id}`)
  await page.getByRole('link', { name: 'Ver equipo', exact: true }).click()
  await expect(page).toHaveURL(/\/team$/)

  // A dialog over the register, so the address does not leave the team.
  await page.getByRole('button', { name: 'Invitar integrante', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva invitación' })
  await dialog.getByLabel('Correo electrónico').fill('person@example.test')
  await dialog.getByRole('button', { name: 'Enviar invitación' }).click()

  /*
   * The register carries the rest — the address, the role, «Vence», pending —
   * so the notice only says the command answered, and the tab it landed in
   * opens behind it. The result screen this replaced said all four again.
   */
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Enviamos la invitación a p***@example.test.')).toBeVisible()
  await expect(page).toHaveURL(
    `/organizations/${activeMembership.organization_id}/team?tab=invitations`,
  )
  await expect(page).not.toHaveURL(/person%40example\.test|person@example\.test/)

  // The workspace home reads pending invitations, so match the command itself
  // rather than the first request that happens to touch the collection.
  const command = fixture.requests.find(
    (request) => request.method === 'POST' && request.path.endsWith('/invitations'),
  )
  expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(command?.headers['command-id']).toMatch(/^[0-9a-f-]{36}$/)
})

/*
 * The address the form had for months, in bookmarks and in links already sent.
 * It opens the dialog over the invitations, and the request leaves the address
 * as soon as it is answered, so going back does not open the dialog again.
 */
test('the address the form used to have opens the dialog, once', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.goto(`/organizations/${activeMembership.organization_id}/team/invitations/new`)

  const team = `/organizations/${activeMembership.organization_id}/team`
  await expect(page.getByRole('dialog', { name: 'Nueva invitación' })).toBeVisible()
  await expect(page).toHaveURL(`${team}?tab=invitations`)

  await page.getByRole('button', { name: 'Cancelar' }).click()

  await expect(page.getByRole('dialog', { name: 'Nueva invitación' })).toBeHidden()
  await expect(page).toHaveURL(`${team}?tab=invitations`)
})

// A role that cannot invite is told so in place, the way the directory does it.
// It used to reach a failure state with a "Reintentar" that could never work,
// and a "Nueva invitación" heading above a message saying the opposite.
test('a coach keeps the invitations section, is refused in place, and never reads the register', async ({
  page,
}) => {
  const coach = { ...secondActiveMembership, roles: ['coach'] }
  const fixture = createStudioApiFixture({ memberships: [coach] })
  await installStudioApiMock(page, fixture)
  await page.goto(`/organizations/${coach.organization_id}/team`)

  const sections = page.getByRole('tablist', { name: 'Secciones del equipo' })
  await sections.getByRole('tab', { name: 'Invitaciones' }).click()
  await expect(page).toHaveURL(`/organizations/${coach.organization_id}/team?tab=invitations`)
  await expect(sections.getByRole('tab', { name: 'Invitaciones' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  await expect(page.getByText('No puedes consultar las invitaciones')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ver roles y permisos' })).toBeVisible()
  expect(fixture.requests.filter(isInvitationListRequest)).toHaveLength(0)
})

test('a coach asking for the dialog gets the refusal instead of a form', async ({ page }) => {
  const coach = { ...secondActiveMembership, roles: ['coach'] }
  const fixture = createStudioApiFixture({ memberships: [coach] })
  await installStudioApiMock(page, fixture)
  await page.goto(`/organizations/${coach.organization_id}/team/invitations/new`)

  await expect(page).toHaveURL(`/organizations/${coach.organization_id}/team?tab=invitations`)
  await expect(page.getByRole('tab', { name: 'Invitaciones' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByText('No puedes consultar las invitaciones')).toBeVisible()
  // The address asked for a form the command would refuse, so none is drawn.
  await expect(page.getByRole('dialog', { name: 'Nueva invitación' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Invitar integrante' })).toHaveCount(0)
})

function isInvitationListRequest(request: { method: string; path: string }): boolean {
  return request.method === 'GET' && /\/organizations\/[^/]+\/invitations$/.test(request.path)
}
