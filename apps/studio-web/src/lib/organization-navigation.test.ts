import { describe, expect, test } from 'bun:test'

import { resolveWorkspaceRoute } from './organization-navigation'

const organizationId = '01991600-1000-7000-8000-000000000002'
const basePath = `/organizations/${organizationId}`

describe('organization workspace navigation', () => {
  test('resolves the durable organization home', () => {
    expect(resolveWorkspaceRoute(basePath, organizationId)).toEqual({
      title: 'Inicio',
    })
  })

  test('resolves the content title', () => {
    expect(resolveWorkspaceRoute(`${basePath}/content`, organizationId)).toEqual({
      title: 'Contenido',
    })
  })

  test('resolves the new template title', () => {
    expect(resolveWorkspaceRoute(`${basePath}/content/templates/new`, organizationId)).toEqual({
      title: 'Nueva plantilla',
    })
  })

  test('resolves the template draft title, without taking `new` for an id', () => {
    expect(
      resolveWorkspaceRoute(
        `${basePath}/content/templates/01991600-a000-7000-8000-000000000001`,
        organizationId,
      ),
    ).toEqual({ title: 'Plantilla' })
    expect(resolveWorkspaceRoute(`${basePath}/content/templates/new`, organizationId).title).toBe(
      'Nueva plantilla',
    )
  })

  test('resolves the new program title', () => {
    expect(resolveWorkspaceRoute(`${basePath}/content/programs/new`, organizationId)).toEqual({
      title: 'Nuevo programa',
    })
  })

  test('resolves the program draft title, without taking `new` for an id', () => {
    expect(
      resolveWorkspaceRoute(
        `${basePath}/content/programs/01991600-9000-7000-8000-000000000003`,
        organizationId,
      ),
    ).toEqual({ title: 'Programa' })
  })

  test('resolves a published version’s title, for a template and for a program', () => {
    expect(
      resolveWorkspaceRoute(
        `${basePath}/content/templates/01991600-a000-7000-8000-000000000001/versions/2`,
        organizationId,
      ),
    ).toEqual({ title: 'Versión de plantilla' })
    expect(
      resolveWorkspaceRoute(
        `${basePath}/content/programs/01991600-9000-7000-8000-000000000001/versions/2`,
        organizationId,
      ),
    ).toEqual({ title: 'Versión de programa' })
  })

  test('resolves the new movement title, and a movement’s, without taking `new` for an id', () => {
    expect(resolveWorkspaceRoute(`${basePath}/content/movements/new`, organizationId)).toEqual({
      title: 'Nuevo movimiento',
    })
    expect(
      resolveWorkspaceRoute(
        `${basePath}/content/movements/01991600-c000-7000-8000-000000000003`,
        organizationId,
      ),
    ).toEqual({ title: 'Movimiento' })
  })

  test('resolves the new plan title, and a plan’s, without taking `new` for an id', () => {
    expect(resolveWorkspaceRoute(`${basePath}/billing/plans/new`, organizationId)).toEqual({
      title: 'Nuevo plan',
    })
    expect(
      resolveWorkspaceRoute(
        `${basePath}/billing/plans/01991600-e000-7000-8000-000000000001`,
        organizationId,
      ),
    ).toEqual({ title: 'Plan' })
  })

  test('resolves the organization details title', () => {
    expect(resolveWorkspaceRoute(`${basePath}/organization`, organizationId)).toEqual({
      title: 'Organización',
    })
  })

  /*
   * Without its own case this route fell through to the "Studio" fallback, so
   * the screen had a heading that named the product instead of the page. One
   * h1 was there, which is why the sweep passed; it just did not say where you
   * were.
   */
  test('resolves the organization edit title rather than the fallback', () => {
    expect(resolveWorkspaceRoute(`${basePath}/organization/edit`, organizationId)).toEqual({
      title: 'Editar datos',
    })
  })

  test('resolves the new site title', () => {
    expect(resolveWorkspaceRoute(`${basePath}/organization/sites/new`, organizationId)).toEqual({
      title: 'Nueva sede',
    })
  })

  test('resolves the site edit title, whatever the site', () => {
    expect(
      resolveWorkspaceRoute(
        `${basePath}/organization/sites/01991600-2000-7000-8000-000000000001`,
        organizationId,
      ),
    ).toEqual({ title: 'Editar sede' })
  })

  test('the new-site route keeps its own title rather than matching the edit pattern', () => {
    expect(resolveWorkspaceRoute(`${basePath}/organization/sites/new`, organizationId)).toEqual({
      title: 'Nueva sede',
    })
  })

  test('resolves the governed role catalogue title without duplicating sidebar hierarchy', () => {
    const rolesPath = `${basePath}/team/roles`
    expect(resolveWorkspaceRoute(rolesPath, organizationId)).toEqual({
      title: 'Roles y permisos',
    })
  })

  test('resolves the invitation creation title', () => {
    expect(resolveWorkspaceRoute(`${basePath}/team/invitations/new`, organizationId)).toEqual({
      title: 'Nueva invitación',
    })
  })

  /*
   * A route missing from this map does not fail anywhere — it silently falls
   * through to "Studio", and the screen ships with the product's name where its
   * own title belongs. That is exactly what happened to the client directory.
   */
  test('resolves the client directory title rather than falling through to the default', () => {
    expect(resolveWorkspaceRoute(`${basePath}/clients`, organizationId)).toEqual({
      title: 'Clientes',
    })
  })

  test('resolves the information categories title', () => {
    expect(
      resolveWorkspaceRoute(`${basePath}/clients/information-categories`, organizationId),
    ).toEqual({ title: 'Categorías de información' })
  })

  /*
   * The relationship route is a bare `[^/]+` under `/clients`, so every static
   * route added beside it has to be excluded by name or it inherits "Vínculo".
   * This asserts both halves: the static one keeps its own title, and a real
   * relationship id still reaches the pattern.
   */
  test('a static route under clients is not mistaken for a relationship', () => {
    const relationshipId = '01991600-3000-7000-8000-000000000001'
    expect(resolveWorkspaceRoute(`${basePath}/clients/${relationshipId}`, organizationId)).toEqual({
      title: 'Vínculo',
    })
    for (const segment of ['invitations', 'information-categories', 'people']) {
      expect(resolveWorkspaceRoute(`${basePath}/clients/${segment}`, organizationId)).not.toEqual({
        title: 'Vínculo',
      })
    }
  })

  /*
   * The card and the relationship are two screens about the same person, and
   * the shell's `h1` is the only thing that says which one is open. A new route
   * that nobody registers here is titled "Studio", which fails silently: the
   * screen renders and only the heading is wrong.
   */
  test('the training profile is titled by the category, under the card', () => {
    const personId = '01991600-3000-7000-8000-0000000000aa'
    expect(
      resolveWorkspaceRoute(`${basePath}/clients/people/${personId}/profile`, organizationId),
    ).toEqual({ title: 'Perfil de entrenamiento' })
  })

  test('her sessions are titled as executed, to tell them from the planned ones', () => {
    const personId = '01991600-3000-7000-8000-0000000000aa'
    expect(
      resolveWorkspaceRoute(`${basePath}/clients/people/${personId}/executions`, organizationId),
    ).toEqual({ title: 'Sesiones ejecutadas' })
  })

  test('a person card is titled Ficha, not Vínculo and not Studio', () => {
    const personId = '01991600-3000-7000-8000-0000000000aa'
    expect(resolveWorkspaceRoute(`${basePath}/clients/people/${personId}`, organizationId)).toEqual(
      { title: 'Ficha' },
    )
  })
})
