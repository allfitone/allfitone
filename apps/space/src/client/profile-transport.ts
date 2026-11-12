/**
 * The native half of «Perfil fitness» and «Identidad y acceso» (TECH-43): two reads and
 * the commands that correct what the person declared, behind the same refresh the other
 * flows use. Every write is a command with its own key, so a retry after a lost answer
 * replays instead of writing twice.
 *
 * The goal, the level, the days, the time and the place are profile claims
 * (`OP-IDN-004`), the zones a set (`OP-IDN-046`); the onboarding writes them through the
 * same two routes, which never belonged to the attempt.
 */

import { newCommand } from '@allfitone/contracts/commands'
import * as Crypto from 'expo-crypto'

import type {
  ContactPhone,
  EmailChange,
  EquipmentPiece,
  FitnessProfile,
  OwnName,
  SpaceIdentity,
} from './fitness-profile'
import { authorizedGet, authorizedPost, authorizedSend } from './index'
import type { BiologicalSex, FocusArea } from './onboarding'
import { authenticated } from './session'

const command = () =>
  newCommand(
    { randomBytes: (length) => Crypto.getRandomValues(new Uint8Array(length)) },
    Date.now(),
  )

export type ClaimCode =
  | 'primary_training_goal'
  | 'training_experience'
  | 'training_days_per_week'
  | 'session_duration'
  | 'training_place'

export function readFitnessProfile(): Promise<FitnessProfile> {
  return authenticated((token) => authorizedGet<FitnessProfile>('/space/v1/profile', token))
}

export function readIdentity(): Promise<SpaceIdentity> {
  return authenticated((token) => authorizedGet<SpaceIdentity>('/space/v1/me', token))
}

export function declareClaim(attributeCode: ClaimCode, value: string): Promise<unknown> {
  const headers = command()
  return authenticated((token) =>
    authorizedPost(
      '/space/v1/profile/claims',
      headers,
      { attribute_code: attributeCode, value_text: value },
      token,
    ),
  )
}

export function declareFocusAreas(areas: readonly FocusArea[]): Promise<unknown> {
  const headers = command()
  return authenticated((token) =>
    authorizedPost('/space/v1/profile/focus-areas', headers, { areas }, token),
  )
}

export function declareEquipment(equipment: readonly EquipmentPiece[]): Promise<unknown> {
  const headers = command()
  return authenticated((token) =>
    authorizedPost('/space/v1/profile/equipment', headers, { equipment }, token),
  )
}

export function correctBiologicalSex(sex: BiologicalSex | null): Promise<unknown> {
  const headers = command()
  return authenticated((token) =>
    authorizedPost('/space/v1/profile/biological-sex', headers, { biological_sex: sex }, token),
  )
}

export function correctName(name: OwnName): Promise<OwnName> {
  const headers = command()
  return authenticated((token) =>
    authorizedPost<OwnName>('/space/v1/me/name', headers, name, token),
  )
}

/** The phone is a contact value (ADR-050): saved at once, never verified, null removes it. */
export function correctPhone(phone: string | null): Promise<ContactPhone> {
  const headers = command()
  return authenticated((token) =>
    authorizedSend<ContactPhone>('PATCH', '/space/v1/me/contact', headers, { phone }, token),
  )
}

/** Asks for the change: a code goes to the new address, and nothing in force moves yet. */
export function requestEmailChange(email: string): Promise<EmailChange> {
  const headers = command()
  return authenticated((token) =>
    authorizedSend<EmailChange>('PATCH', '/space/v1/me/contact', headers, { email }, token),
  )
}

/**
 * `OP-IDN-066`: the current password and the new one, and nothing comes back. The other
 * sessions close in the background; this one stays.
 */
export async function changePassword(current: string, next: string): Promise<void> {
  const headers = command()
  await authenticated((token) =>
    authorizedPost<undefined>(
      '/space/v1/me/password',
      headers,
      { current_password: current, new_password: next },
      token,
    ),
  )
}

/** The code from the new inbox; the change is then applied in the background. */
export function verifyEmailChange(code: string): Promise<{ outcome: 'applying' }> {
  const headers = command()
  return authenticated((token) =>
    authorizedPost<{ outcome: 'applying' }>(
      '/space/v1/me/contact/verification',
      headers,
      { code },
      token,
    ),
  )
}
