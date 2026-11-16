/**
 * The program versions a professional may offer a person, projected from the
 * organization's content.
 *
 * Moved out of `invitation-program.ts` when the assignment screen became its
 * second reader. Two screens ask the same question of the same answer — which
 * of this organization's program versions can be given to somebody — and the
 * rule that decides it is not obvious: a published version of an archived
 * program is not offerable, which is the part a second copy would have missed.
 */
import type { Program } from './studio-api'

export interface ProposableVersion {
  version_id: string
  program_id: string
  title: string
  version_number: number
  session_count: number
  /** True when the program has no end, so its session count is a week, not a total. */
  repeats_forever: boolean
  /** Published template versions kept in this composition but already retired. */
  deprecated_template_version_ids: readonly string[]
}

export function proposableVersions(programs: readonly Program[]): ProposableVersion[] {
  return programs
    .filter((program) => program.status !== 'archived')
    .flatMap((program) =>
      program.versions
        .filter((version) => version.status === 'published')
        .map((version) => ({
          version_id: version.id,
          program_id: program.id,
          title: version.title,
          version_number: version.version_number,
          session_count: version.session_count,
          repeats_forever: version.repeats_forever,
          deprecated_template_version_ids: version.deprecated_template_version_ids,
        })),
    )
    .toSorted(
      (left, right) =>
        left.title.localeCompare(right.title, 'es') || right.version_number - left.version_number,
    )
}
