export interface WorkspaceRouteMetadata {
  title: string
}

export function resolveWorkspaceRoute(
  pathname: string,
  organizationId: string,
): WorkspaceRouteMetadata {
  const basePath = `/organizations/${organizationId}`
  const teamPath = `${basePath}/team`
  const invitationPath = `${teamPath}/invitations`

  if (pathname === basePath) {
    return { title: 'Inicio' }
  }
  if (pathname === `${basePath}/content`) {
    return { title: 'Contenido' }
  }
  if (pathname === `${basePath}/content/templates/new`) {
    return { title: 'Nueva plantilla' }
  }
  // `new` is matched above, so it never reaches this as a template id.
  if (/^\/organizations\/[^/]+\/content\/templates\/[^/]+$/.test(pathname)) {
    return { title: 'Plantilla' }
  }
  if (pathname === `${basePath}/content/programs/new`) {
    return { title: 'Nuevo programa' }
  }
  if (/^\/organizations\/[^/]+\/content\/programs\/[^/]+$/.test(pathname)) {
    return { title: 'Programa' }
  }
  if (pathname === `${basePath}/content/movements/new`) {
    return { title: 'Nuevo movimiento' }
  }
  if (/^\/organizations\/[^/]+\/content\/movements\/[^/]+$/.test(pathname)) {
    return { title: 'Movimiento' }
  }
  if (/^\/organizations\/[^/]+\/content\/templates\/[^/]+\/versions\/[^/]+$/.test(pathname)) {
    return { title: 'Versión de plantilla' }
  }
  if (/^\/organizations\/[^/]+\/content\/programs\/[^/]+\/versions\/[^/]+$/.test(pathname)) {
    return { title: 'Versión de programa' }
  }
  if (pathname === `${basePath}/organization`) {
    return { title: 'Organización' }
  }
  // "Datos" is the word the card on the section above already uses, and the
  // button that leads here says "Editar datos".
  if (pathname === `${basePath}/organization/edit`) {
    return { title: 'Editar datos' }
  }
  if (pathname === `${basePath}/organization/sites/new`) {
    return { title: 'Nueva sede' }
  }
  if (/^\/organizations\/[^/]+\/organization\/sites\/[^/]+$/.test(pathname)) {
    return { title: 'Editar sede' }
  }
  if (pathname === teamPath) {
    return { title: 'Integrantes' }
  }
  if (pathname === invitationPath) {
    return { title: 'Invitaciones' }
  }
  if (pathname === `${invitationPath}/new`) {
    return { title: 'Nueva invitación' }
  }
  if (pathname === `${teamPath}/roles`) {
    return { title: 'Roles y permisos' }
  }
  if (pathname === `${basePath}/clients`) {
    return { title: 'Clientes' }
  }
  if (pathname === `${basePath}/clients/invitations/new`) {
    return { title: 'Invitar cliente' }
  }
  if (pathname === `${basePath}/clients/information-categories`) {
    return { title: 'Categorías de información' }
  }
  if (pathname === `${basePath}/clients/authorizations`) {
    return { title: 'Autorizaciones' }
  }
  /*
   * "Ficha" is the word the story uses — "abrir la ficha de mi cliente" — and
   * it is a different screen from the one below: the link is how the gym stands
   * with her, the card is what she lets this coach read.
   */
  if (/^\/organizations\/[^/]+\/clients\/people\/[^/]+$/.test(pathname)) {
    return { title: 'Ficha' }
  }
  /*
   * Named after the category she shares rather than after the screen: a coach
   * reading "Perfil" would not know which of the seven he is looking at.
   */
  if (/^\/organizations\/[^/]+\/clients\/people\/[^/]+\/profile$/.test(pathname)) {
    return { title: 'Perfil de entrenamiento' }
  }
  /*
   * "Ejecutadas" because the product also has planned sessions: a heading that
   * said only "Sesiones" would not say which of the two is open.
   */
  if (/^\/organizations\/[^/]+\/clients\/people\/[^/]+\/executions$/.test(pathname)) {
    return { title: 'Sesiones ejecutadas' }
  }
  /*
   * "Vínculo" because that is the word the directory already uses for this
   * thing — "Vínculo desde", "vínculos finalizados". The segment cannot be
   * `invitations`, `information-categories`, `authorizations` or `people`,
   * which are paths and not relationship ids; all are excluded here as well as
   * matched above, because a static route added below this one would otherwise
   * be titled "Vínculo".
   */
  if (
    /^\/organizations\/[^/]+\/clients\/(?!invitations$|information-categories$|authorizations$|people$)[^/]+$/.test(
      pathname,
    )
  ) {
    return { title: 'Vínculo' }
  }
  // "Cobros" and not "Pagos": Allfit reflects the state of a payment and never processes
  // one, so the word for the screen is the gym's activity, not the transaction.
  if (pathname === `${basePath}/billing`) {
    return { title: 'Cobros' }
  }
  if (pathname === `${basePath}/billing/plans/new`) {
    return { title: 'Nuevo plan' }
  }
  // `new` is matched above, so it never reaches this as a plan id.
  if (/^\/organizations\/[^/]+\/billing\/plans\/[^/]+$/.test(pathname)) {
    return { title: 'Plan' }
  }
  return { title: 'Studio' }
}
