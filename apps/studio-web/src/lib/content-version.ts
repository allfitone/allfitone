/**
 * Reading one published version, whole: `HU-STUDIO-045`.
 *
 * Both criteria are the server's, and this file only puts them into words:
 *
 * 1. **Only versions of my organization.** `OP-PLN-021` reads a template or a
 *    program version through the organization in the path and answers 404 for
 *    anything else, so another organization's version and one that never
 *    existed look the same here.
 * 2. **It is immutable: what I read today is what was trained yesterday.** A
 *    version has no write route. Only its status moves, when it is retired,
 *    which is why the read is revalidated rather than cached for good.
 *
 * Everything here is read-only text: a step's targets are said in sentences,
 * not shown as the form that wrote them, because nothing on this page can be
 * changed.
 */

import { SIDE_LABEL } from './session-template-editor'
import type { PlannedStepContent, ProgramSessionContent } from './studio-api'

/** The version in the address, or null for anything that cannot be one. */
export function parseVersionNumber(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d{0,8}$/.test(value)) return null
  return Number(value)
}

export function versionStatusLabel(status: 'published' | 'deprecated'): string {
  return status === 'deprecated' ? 'Retirada' : 'Publicada'
}

const NUMBER = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

function number(value: number): string {
  return NUMBER.format(value)
}

export function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round((seconds - minutes * 60) * 100) / 100
  if (minutes === 0) return `${number(rest)} s`
  if (rest === 0) return `${minutes} min`
  return `${minutes} min ${number(rest)} s`
}

function repetitions(count: number): string {
  return count === 1 ? '1 repetición' : `${count} repeticiones`
}

function load(value: number | null | undefined, unit: string | null | undefined): string {
  return value === null || value === undefined ? '' : ` · ${number(value)} ${unit ?? ''}`.trimEnd()
}

function rpe(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : ` · RPE ${number(value)}`
}

const SET_KIND_SUFFIX = {
  normal: '',
  warmup: ' (calentamiento)',
  to_failure: ' (al fallo)',
  drop: ' (descendente)',
} as const

/** A step's targets as the sentences a coach reads them in. */
export function describeTarget(target: PlannedStepContent['target']): string[] {
  switch (target.family) {
    case 'strength': {
      const lines = target.sets?.length
        ? target.sets.map((set) => {
            const reps =
              set.kind === 'to_failure'
                ? 'hasta el fallo'
                : set.target_reps
                  ? repetitions(set.target_reps)
                  : 'sin repeticiones fijadas'
            return `Serie ${set.set_order}${SET_KIND_SUFFIX[set.kind]}: ${reps}${load(set.target_load_value, set.target_load_unit_code)}${rpe(set.target_rpe)}`
          })
        : [
            `${target.target_sets ?? 1} series${target.target_reps ? ` de ${repetitions(target.target_reps)}` : ''}${load(target.target_load_value, target.target_load_unit_code)}${rpe(target.target_rpe)}`,
          ]
      if (target.target_rest_seconds !== null && target.target_rest_seconds !== undefined) {
        lines.push(`Descanso entre series: ${formatSeconds(target.target_rest_seconds)}`)
      }
      return lines
    }
    case 'endurance': {
      const lines: string[] = []
      if (target.target_distance_value) {
        lines.push(
          `Distancia: ${number(target.target_distance_value)} ${target.target_distance_unit_code ?? ''}`.trimEnd(),
        )
      }
      if (target.target_duration_seconds) {
        lines.push(`Duración: ${formatSeconds(target.target_duration_seconds)}`)
      }
      if (target.target_pace_seconds_per_unit) {
        lines.push(
          `Ritmo: ${formatSeconds(target.target_pace_seconds_per_unit)} por ${target.target_pace_unit_code ?? 'unidad'}`,
        )
      }
      return lines
    }
    case 'interval': {
      const rest =
        target.rest_duration_seconds === null || target.rest_duration_seconds === undefined
          ? ''
          : ` y ${formatSeconds(target.rest_duration_seconds)} de descanso`
      const lines = [
        `${target.rounds} ${target.rounds === 1 ? 'ronda' : 'rondas'} de ${formatSeconds(target.work_duration_seconds)} de trabajo${rest}`,
      ]
      if (target.target_rpe !== null && target.target_rpe !== undefined) {
        lines.push(`Esfuerzo: RPE ${number(target.target_rpe)}`)
      }
      return lines
    }
    case 'mobility': {
      const lines: string[] = []
      if (target.hold_duration_seconds) {
        lines.push(`Sostener ${formatSeconds(target.hold_duration_seconds)}`)
      }
      if (target.target_repetitions) lines.push(repetitions(target.target_repetitions))
      if (target.side !== 'not_applicable') {
        lines.push(`Lado: ${SIDE_LABEL[target.side].toLocaleLowerCase('es-CO')}`)
      }
      return lines
    }
  }
}

/** A program version's sessions by week, in day order and then position. */
export function programVersionWeeks(
  sessions: readonly ProgramSessionContent[],
): Array<{ week: number; sessions: ProgramSessionContent[] }> {
  const weeks = new Map<number, ProgramSessionContent[]>()
  const ordered = sessions.toSorted(
    (left, right) =>
      left.week - right.week || left.day - right.day || left.position - right.position,
  )
  for (const session of ordered) {
    weeks.set(session.week, [...(weeks.get(session.week) ?? []), session])
  }
  return [...weeks].map(([week, entries]) => ({ week, sessions: entries }))
}

/**
 * Retiring a version is the owner's and the admin's (`HU-STUDIO-040` and
 * `HU-STUDIO-043`). `planning.assert_deprecate_content` checks the role itself,
 * not a capability, so this reads the roles the same way.
 */
export function canRetireContent(roles: readonly string[]): boolean {
  return roles.includes('owner') || roles.includes('admin')
}

/**
 * `HU-STUDIO-039` criterion 1, said where the draft is edited: the version it
 * was started from, by number when the template's versions are at hand.
 */
export function derivedFromLabel(
  versionId: string | null | undefined,
  versions: ReadonlyArray<{ id: string; version_number: number }>,
): string | undefined {
  if (!versionId) return undefined
  const source = versions.find((version) => version.id === versionId)
  return source
    ? `Parte de la versión ${source.version_number}.`
    : 'Parte de una versión publicada.'
}

export function retireFailure(status: number): string {
  if (status === 403) {
    return 'Retirar versiones corresponde a propietario y administración, y tu rol ya no lo permite.'
  }
  if (status === 404) return 'Esta versión ya no está disponible para tu organización.'
  if (status === 409 || status === 429) {
    return 'Ese retiro ya está en curso. Espera un momento y reintenta.'
  }
  if (status === 503) return 'Retirar está pausado temporalmente. Reintenta más tarde.'
  return 'No pudimos retirar la versión. Reintenta en un momento.'
}

/**
 * Starting from a version answers 404 for a retired one too: the command reads
 * only published versions of the organization's own template.
 */
export function deriveFailure(status: number): string {
  if (status === 404) {
    return 'Esa versión ya no se puede usar como punto de partida: no está publicada o no es de tu organización.'
  }
  if (status === 403) {
    return 'Ya no puedes editar esta plantilla: tu rol cambió o la organización no está activa.'
  }
  if (status === 409 || status === 429) {
    return 'Ese cambio ya está en curso. Espera un momento y reintenta.'
  }
  if (status === 503) return 'Está pausado temporalmente. Reintenta más tarde.'
  return 'No pudimos partir de esta versión. Reintenta en un momento.'
}
