/**
 * The Backoffice navigation and the entry a screen belongs to.
 *
 * Entries nest: «Reglas de resultados» lives under «Catálogo global». Lighting
 * every entry whose path prefixes the screen's lit both at once, so the screen
 * belongs to the longest matching path alone, whatever order the menu lists.
 */

export interface WorkspaceRoute {
  href: string
  title: string
  icon: 'permissions' | 'people' | 'operation'
}

export const BACKOFFICE_ROUTES: readonly WorkspaceRoute[] = [
  { href: '/panel', title: 'Inicio', icon: 'operation' },
  { href: '/people', title: 'Personas', icon: 'people' },
  { href: '/organizations', title: 'Gimnasios', icon: 'operation' },
  { href: '/access-log', title: 'Registro de accesos', icon: 'operation' },
  { href: '/verifications', title: 'Verificación de títulos', icon: 'people' },
  { href: '/break-glass', title: 'Acceso excepcional', icon: 'permissions' },
  { href: '/diagnosis', title: 'Diagnóstico técnico', icon: 'operation' },
  { href: '/team', title: 'Equipo de Allfit', icon: 'permissions' },
  { href: '/catalogue/result-contracts', title: 'Reglas de resultados', icon: 'operation' },
  { href: '/catalogue', title: 'Catálogo global', icon: 'operation' },
  { href: '/plans', title: 'Planes de Allfit', icon: 'operation' },
  { href: '/erasure-requests', title: 'Solicitudes de eliminación', icon: 'permissions' },
  { href: '/permissions', title: 'Definiciones de permiso', icon: 'permissions' },
]

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
