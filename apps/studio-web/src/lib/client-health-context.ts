/**
 * What the authorized health context screen decides, and the words it says
 * things in: `HU-STUDIO-053`.
 *
 * `OP-IDN-020` answers the pains, limitations and recoveries she declared,
 * newest first. Three things about that answer shape this module, and only the
 * first is in the story.
 *
 * **It is not a clinical record, and nothing here could make it one.** Three
 * types, an area out of fourteen, her own words and since when. No clinical
 * history, diagnosis, test or medical document exists in Allfit to be shared.
 *
 * **What no longer holds still arrives, and stays.** A pain that cleared up is
 * still a pain she had, and a coach needs to know there was an injury last
 * month. So the screen sorts rather than filters: what affects her today, what
 * is healing, what ended — the order Space shows her own list in.
 *
 * **A field the version withholds is null, and is left out.** The description,
 * the area and the origin each travel on their own; a missing one is never
 * described, because «sin origen» would claim the datum has none. A version that
 * hides since when shares no row at all, so a claim without a date cannot arrive.
 *
 * The type and area names are Space's (`apps/space/src/client/health-context.ts`),
 * copied on purpose: an app may not import another app, and these are the words
 * she chose from, so the coach should read the same ones.
 */
import { provenanceLine } from './client-training-profile'
import type {
  ClientHealthContextClaim,
  HealthContextBodyArea,
  HealthContextType,
} from './studio-api'

const TYPES: Record<HealthContextType, string> = {
  pain: 'Dolor',
  limitation: 'Limitación',
  recovery: 'Recuperación',
}

const AREAS: Record<HealthContextBodyArea, string> = {
  neck: 'Cuello',
  shoulder: 'Hombro',
  chest: 'Pecho',
  upper_back: 'Espalda alta',
  arm: 'Brazo',
  elbow: 'Codo',
  wrist_hand: 'Muñeca y mano',
  abdomen: 'Abdomen',
  lower_back: 'Espalda baja',
  hip: 'Cadera',
  thigh: 'Muslo',
  knee: 'Rodilla',
  lower_leg: 'Pierna',
  ankle_foot: 'Tobillo y pie',
}

export function contextTypeLabel(type: HealthContextType): string {
  return TYPES[type]
}

export function bodyAreaLabel(area: HealthContextBodyArea): string {
  return AREAS[area]
}

/** Its type, and the area when she named one — or when the version shares it. */
export function claimHeading(
  claim: Pick<ClientHealthContextClaim, 'context_type' | 'body_area'>,
): string {
  const type = TYPES[claim.context_type]
  return claim.body_area ? `${type} · ${AREAS[claim.body_area]}` : type
}

/** Where it came from, or null when the version does not carry the origin. */
export function claimOriginLine(
  claim: Pick<ClientHealthContextClaim, 'provenance'>,
): string | null {
  return claim.provenance ? provenanceLine(claim.provenance) : null
}

export function healthVersionLine(version: number): string {
  return `Versión ${String(version)} del permiso de contexto de salud`
}

export function hasEnded(claim: Pick<ClientHealthContextClaim, 'valid_to'>, now: Date): boolean {
  return claim.valid_to !== null && Date.parse(claim.valid_to) <= now.getTime()
}

function day(instant: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(instant))
}

/**
 * From when, and until when once it is known. Only a recovery can have an end
 * still ahead: Space offers «hasta» for a recovery alone.
 */
export function claimPeriodLine(
  claim: Pick<ClientHealthContextClaim, 'valid_from' | 'valid_to'>,
  now: Date,
): string {
  if (claim.valid_to === null) return `Desde el ${day(claim.valid_from)}`
  if (hasEnded(claim, now)) return `Del ${day(claim.valid_from)} al ${day(claim.valid_to)}`
  return `Desde el ${day(claim.valid_from)}, hasta el ${day(claim.valid_to)}`
}

export type HealthSectionKey = 'current' | 'healing' | 'ended'

export interface HealthSection {
  readonly key: HealthSectionKey
  readonly title: string
  readonly claims: readonly ClientHealthContextClaim[]
}

const SECTION_TITLES: Record<HealthSectionKey, string> = {
  current: 'Lo que la afecta hoy',
  healing: 'En recuperación',
  ended: 'Lo que ya terminó',
}

function sectionOf(claim: ClientHealthContextClaim, now: Date): HealthSectionKey {
  if (hasEnded(claim, now)) return 'ended'
  return claim.context_type === 'recovery' ? 'healing' : 'current'
}

/**
 * Every claim in exactly one section, in the order the API answered inside each;
 * a section with nothing in it is not returned, so it is never drawn empty.
 */
export function healthSections(
  claims: readonly ClientHealthContextClaim[],
  now: Date,
): readonly HealthSection[] {
  const keys: readonly HealthSectionKey[] = ['current', 'healing', 'ended']
  return keys
    .map((key) => ({
      key,
      title: SECTION_TITLES[key],
      claims: claims.filter((claim) => sectionOf(claim, now) === key),
    }))
    .filter((section) => section.claims.length > 0)
}
