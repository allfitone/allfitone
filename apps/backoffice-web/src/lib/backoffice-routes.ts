/**
 * The Backoffice navigation and the entry a screen belongs to.
 *
 * Entries are grouped by the area of the duty a screen exercises, the three
 * actor modes of ADR-037: an operator who holds «Curar el catálogo global»
 * finds every screen that duty opens under the same heading, and a refused
 * screen names the area to ask for. The menu is the duty model, drawn.
 *
 * Entries nest: «Reglas de resultados» lives under «Catálogo global». Lighting
 * every entry whose path prefixes the screen's lit both at once, so the screen
 * belongs to the longest matching path alone, whatever order the menu lists.
 */

import type { IconName } from '@allfitone/react/icons'

import type { PlatformActorMode } from './platform-access'

export interface WorkspaceRoute {
  href: string
  title: string
  icon: IconName
  area: PlatformActorMode
}

/** The order the areas take in the menu: where most work starts, first. */
export const BACKOFFICE_AREAS: readonly PlatformActorMode[] = ['A10', 'A11', 'A12']

export const BACKOFFICE_ROUTES: readonly WorkspaceRoute[] = [
  { href: '/panel', title: 'Inicio', icon: 'overview', area: 'A10' },
  { href: '/people', title: 'Personas', icon: 'person', area: 'A10' },
  { href: '/organizations', title: 'Gimnasios', icon: 'organization', area: 'A10' },
  { href: '/diagnosis', title: 'Diagnóstico técnico', icon: 'activity', area: 'A10' },
  { href: '/plans', title: 'Planes de Allfit One', icon: 'business', area: 'A10' },
  { href: '/verifications', title: 'Verificación de títulos', icon: 'check', area: 'A11' },
  { href: '/catalogue', title: 'Catálogo global', icon: 'training', area: 'A11' },
  {
    href: '/catalogue/result-contracts',
    title: 'Reglas de resultados',
    icon: 'operation',
    area: 'A11',
  },
  { href: '/team', title: 'Equipo de Allfit One', icon: 'people', area: 'A12' },
  { href: '/access-log', title: 'Registro de accesos', icon: 'time', area: 'A12' },
  { href: '/break-glass', title: 'Acceso excepcional', icon: 'warning', area: 'A12' },
  { href: '/erasure-requests', title: 'Solicitudes de eliminación', icon: 'remove', area: 'A12' },
  { href: '/permissions', title: 'Definiciones de permiso', icon: 'permissions', area: 'A12' },
]

/** The entries of one area, in menu order. */
export function routesInArea(
  area: PlatformActorMode,
  routes: readonly WorkspaceRoute[] = BACKOFFICE_ROUTES,
): WorkspaceRoute[] {
  return routes.filter((route) => route.area === area)
}

/** The entry the screen at `pathname` belongs to, or none when the menu does not list it. */
export function currentBackofficeRoute(
  pathname: string,
  routes: readonly WorkspaceRoute[] = BACKOFFICE_ROUTES,
): WorkspaceRoute | undefined {
  return routes
    .filter((route) => pathname === route.href || pathname.startsWith(`${route.href}/`))
    .reduce<WorkspaceRoute | undefined>(
      (longest, route) => (!longest || route.href.length > longest.href.length ? route : longest),
      undefined,
    )
}
