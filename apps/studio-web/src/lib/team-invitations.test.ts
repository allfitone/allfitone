import { expect, test } from 'bun:test'

import {
  INVITATION_CREATE_UNKNOWN_ERROR,
  canInviteTeam,
  invitationCreateMessage,
  invitationCreatedNotice,
  invitationRoleOptions,
} from './team-invitations.js'
import type { StudioApiError } from './studio-api.js'

test('owner and admin can propose every non-owner role', () => {
  expect(invitationRoleOptions(['owner']).map(({ value }) => value)).toEqual([
    'admin',
    'coach',
    'staff',
  ])
  expect(invitationRoleOptions(['admin']).map(({ value }) => value)).toEqual([
    'admin',
    'coach',
    'staff',
  ])
})

test('staff can only propose staff and coach cannot invite', () => {
  expect(invitationRoleOptions(['staff']).map(({ value }) => value)).toEqual(['staff'])
  expect(invitationRoleOptions(['coach'])).toEqual([])
  expect(canInviteTeam(['coach'])).toBeFalse()
})

test('each answer the invitation command gives has its own message', () => {
  const answer = (status: number) =>
    invitationCreateMessage({ status } as unknown as StudioApiError)

  expect(answer(403)).toBe('Tu rol actual no permite crear esta invitación.')
  expect(answer(404)).toBe('Ya no tienes acceso activo a esta organización.')
  expect(answer(422)).toBe('Revisa el correo y el rol propuesto.')
  expect(answer(503)).toBe('Las invitaciones están pausadas temporalmente. Reintenta más tarde.')
  expect(answer(500)).toBe(INVITATION_CREATE_UNKNOWN_ERROR)
})

/*
 * The one thing the register behind the dialog cannot show: inviting an
 * address that already had an invitation renews that one rather than adding a
 * second, so the list looks the same either way.
 */
test('the notice tells a new invitation from a renewed one', () => {
  expect(invitationCreatedNotice('p***@example.test', false)).toBe(
    'Enviamos la invitación a p***@example.test.',
  )
  expect(invitationCreatedNotice('p***@example.test', true)).toBe(
    'Renovamos la invitación de p***@example.test.',
  )
})
