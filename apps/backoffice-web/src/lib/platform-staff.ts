/**
 * Who on Allfit's team acted on a record, as the screens say it.
 *
 * The database resolves a name only for people who hold or held a platform role or duty,
 * so a projection may carry `null` where it could not. The screen then names the person
 * by the start of their identifier rather than by nobody: an audit trail that says "alguien"
 * without a way to find them answers nothing.
 */

export function staffName(name: string | null, personId: string): string {
  return name ?? `alguien del equipo (${personId.slice(0, 8)})`
}
