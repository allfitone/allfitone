/**
 * The reference of the support case that justifies a read or a command.
 *
 * It is a ticket's key, never prose: a sentence would look traceable and not
 * be, so it stays refused (ADR-046). What changed is the case of the letters.
 * The reference was refused in lowercase although the screen could write it as
 * the API takes it, so it is trimmed and put in capitals before it is checked,
 * and sent that way. Support, Equipo and Acceso excepcional each kept a copy of
 * this rule; this is the one.
 */

const CASE_REFERENCE = /^[A-Z][A-Z0-9_-]{2,63}$/

/** As the API stores it: no surrounding space, in capitals. */
export function normalizeCaseReference(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidCaseReference(value: string): boolean {
  return CASE_REFERENCE.test(normalizeCaseReference(value))
}

/** A read may name no case (ADR-046); one given in free text is still refused. */
export function isValidOptionalCaseReference(value: string): boolean {
  return value.trim() === '' || isValidCaseReference(value)
}
