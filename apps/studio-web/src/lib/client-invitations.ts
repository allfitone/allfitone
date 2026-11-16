/**
 * The rules the invitation form needs before it sends anything.
 *
 * Permission is read from the role catalog the server publishes rather than
 * from a list of role codes written here. PostgreSQL grants inviting through
 * the `invite_clients` capability, and a copy of that mapping in the client is
 * a second source of truth that drifts silently the day the grant changes.
 */
import {
  CONTRIBUTE,
  TRAINING_SCOPE,
  isProposing,
  noProgram,
  proposalTimeZone,
  type ProgramDraft,
} from './invitation-program'
import type { ClientInvitationCreate, OfferableScope, OrganizationRole } from './studio-api'

const INVITE_CLIENTS = 'invite_clients'

/**
 * Every invitation asks to read, never to write.
 *
 * The scope table in the domain glossary is explicit that
 * `prior_training_history`, `nutrition_intake` and `nutrition_media` never
 * admit professional writing at all, and that the rest take `contribute` only
 * on an explicit further acceptance. A checkbox that silently asked for write
 * access would be exactly the thing that rule exists to prevent, so the form
 * does not offer the choice: it asks to read, and raising that is a separate,
 * explicit conversation nobody has designed yet.
 */
const INVITATION_ACCESS_LEVEL = 'read' as const

export interface InvitationDraft {
  contact: string
  /** Scope codes the professional ticked, in catalogue order. */
  scopeCodes: string[]
  /**
   * The optional first program. Absent, or with no version chosen, means none
   * is proposed and every scope stays at `read` as before.
   */
  program?: ProgramDraft
}

export type InvitationDraftErrors = Partial<Record<'contact' | 'scopes', string>>

export function canInviteClients(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === INVITE_CLIENTS),
  )
}

/**
 * The address is checked for shape only. Whether it belongs to somebody, or to
 * somebody who already has an account, is deliberately not knowable here: the
 * command never reveals it, so a professional cannot use an invitation to find
 * out who is registered.
 */
export function validateDraft(draft: InvitationDraft): InvitationDraftErrors {
  const errors: InvitationDraftErrors = {}
  const contact = draft.contact.trim()
  if (!contact) {
    errors.contact = 'Escribe el correo de la persona que quieres invitar.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contact)) {
    errors.contact = 'Ese correo no parece válido. Revísalo.'
  } else if (contact.length > 254) {
    errors.contact = 'Ese correo es demasiado largo.'
  }
  if (draft.scopeCodes.length === 0) {
    errors.scopes = 'Marca al menos un permiso. Una invitación que no pide nada no sirve de nada.'
  } else if (
    isProposing(draft.program ?? noProgram) &&
    !draft.scopeCodes.includes(TRAINING_SCOPE)
  ) {
    /*
     * The form ticks it when a program is chosen, so a reader should never see
     * this. It is here because the invariant belongs to the draft and not to a
     * component: a body that proposes a program without that scope is refused
     * by PostgreSQL with a `22023` the screen cannot explain.
     */
    errors.scopes = 'El programa necesita el permiso de entrenamiento. Márcalo o quita el programa.'
  }
  return errors
}

/**
 * The purpose and the contract text come from the catalogue, never from this
 * screen. A gym writing its own justification for wanting health data writes it
 * with nobody reviewing it, and the snapshot is what the person will be shown
 * and what the invitation freezes.
 */
export function invitationBody(
  draft: InvitationDraft,
  catalog: readonly OfferableScope[],
  timeZone: string = proposalTimeZone(),
): ClientInvitationCreate {
  const program = draft.program ?? noProgram
  const proposing = isProposing(program)
  const chosen = catalog.filter((scope) => draft.scopeCodes.includes(scope.scope_code))
  const scopes: ClientInvitationCreate['scopes'] = chosen.map((scope) => {
    // What the person will be shown, frozen into the invitation as it is sent.
    // Editing the catalogue later never rewrites what somebody already read.
    const presented_snapshot: Record<string, unknown> = {
      display_name: scope.display_name,
      description: scope.description,
      version_number: scope.version_number,
    }
    return {
      scope_code: scope.scope_code,
      /*
       * `read`, except the one scope a proposed program cannot start without.
       * Raising it here rather than offering a level per scope keeps the rule
       * above intact: the professional never picks write access, a program
       * does — and the form shows that scope ticked and says why, so nothing
       * is asked for that the reader cannot see.
       */
      access_level:
        proposing && scope.scope_code === TRAINING_SCOPE ? CONTRIBUTE : INVITATION_ACCESS_LEVEL,
      purpose: scope.default_purpose,
      presented_snapshot,
    }
  })
  const body: ClientInvitationCreate = {
    channel: 'email',
    contact: draft.contact.trim().toLowerCase(),
    scopes,
  }
  // All three or none: two of the three is a `22023` the screen cannot explain.
  if (proposing) {
    body.program = {
      program_version_id: program.versionId,
      starts_on: program.startsOn,
      timezone: timeZone,
    }
  }
  return body
}

/** Keeps the ticked scopes in catalogue order, whatever order they were ticked. */
export function toggleScope(
  scopeCodes: readonly string[],
  code: string,
  catalog: readonly OfferableScope[],
): string[] {
  const next = scopeCodes.includes(code)
    ? scopeCodes.filter((entry) => entry !== code)
    : [...scopeCodes, code]
  return catalog.map((scope) => scope.scope_code).filter((entry) => next.includes(entry))
}
