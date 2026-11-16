import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  publishedProgram,
  secondActiveMembership,
} from './studio-api-mock'

/*
 * HU-STUDIO-044, the first screen of the content block. Its three criteria are
 * all about telling things apart and keeping them in, and two of them are the
 * database's: this audits the one that is the screen's — a draft is explicitly
 * not a published version — plus the capability gate and every state.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`

function openContent(page: Page) {
  return page.goto(CONTENT_PATH)
}

function card(page: Page, name: string) {
  return page.locator('[data-content-register-item]', { hasText: name })
}

test('an owner reads the content, because the catalogue gives them manage_content', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Contenido' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Plantillas' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Programas' })).toBeVisible()
})

/*
 * Criterion 1, which is the whole of this screen's own work: the two are said
 * apart and never added up. «3 versiones» would hide that one is retired and
 * cannot be assigned any more.
 */
test('a draft and the published versions are counted separately', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await expect(card(page, 'Fuerza tren superior')).toContainText(
    'Borrador sin publicar · 1 versión publicada · 1 retirada',
  )
})

test('a template with nothing published says it cannot be assigned', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  const row = card(page, 'Movilidad matutina')
  await expect(row).toContainText('Borrador sin publicar')
  await expect(row).toContainText('Nada publicado todavía')
  // And no disclosure, because there are no versions to disclose.
  await expect(row.getByRole('button', { name: /Ver versiones/ })).toHaveCount(0)
})

// ADR-009: an adaptation keeps its source, so the list says which rows are one.
test('a template started from another version is marked as an adaptation', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await expect(card(page, 'Fuerza adaptada')).toContainText('Adaptación')
  await expect(card(page, 'Movilidad matutina')).not.toContainText('Adaptación')
})

test('the versions open on demand, newest first, with the retired one marked', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  const row = card(page, 'Fuerza tren superior')
  await row.getByRole('button', { name: /Ver versiones · 2/ }).click()

  const versions = row.locator('[data-content-version-list] > li')
  await expect(versions).toHaveCount(2)
  await expect(versions.first()).toContainText('v2')
  await expect(versions.last()).toContainText('v1')
  await expect(versions.last()).toContainText('Retirada')
})

test('archived content is out of the list and behind its own disclosure', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await expect(card(page, 'Circuito antiguo')).toHaveCount(0)
  await page.getByRole('button', { name: 'Archivado · 1' }).click()
  await expect(card(page, 'Circuito antiguo')).toBeVisible()
})

test('the programs tab reads its own list', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await page.getByRole('tab', { name: 'Programas' }).click()

  // The program fixture has no draft, so only what is published is counted.
  await expect(card(page, 'Bloque de fuerza')).toContainText('1 versión publicada')
  await expect(card(page, 'Fuerza tren superior')).toHaveCount(0)
})

test('a program version carries its own title, which a template version does not', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await page.getByRole('tab', { name: 'Programas' }).click()
  const row = card(page, 'Bloque de fuerza')
  await row.getByRole('button', { name: /Ver versiones/ }).click()

  const version = row.locator('[data-content-version-list] > li').first()
  await expect(version).toContainText('v2')
  await expect(version).toContainText(publishedProgram.versions[0]?.title ?? 'Bloque de fuerza')
})

test('each tab has its own empty state, because they differ', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.organizationSessionTemplates = []
  fixture.organizationPrograms = []
  await installStudioApiMock(page, fixture)
  await openContent(page)

  // A template is what a program is built out of, so its absence is the one
  // that explains the order to work in.
  await expect(page.getByText(/Todavía no hay plantillas/)).toBeVisible()
  await expect(page.getByText(/un programa se compone de versiones publicadas/)).toBeVisible()

  await page.getByRole('tab', { name: 'Programas' }).click()
  await expect(page.getByText(/Todavía no hay programas/)).toBeVisible()
})

/*
 * The capability, not a role code. `manage_content` belongs to coach, owner and
 * admin; a staff member reaches the sidebar entry and the screen says no rather
 * than letting two reads come back 403.
 */
test('a role without manage_content is told so instead of seeing a failure', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [secondActiveMembership] })
  fixture.organizationRoles = [
    {
      code: 'coach',
      name: 'Coach',
      description: null,
      capabilities: [
        { code: 'view_assigned_directory', name: 'Solo asignadas', description: null },
      ],
      fitness_data_access_policy: 'not_granted_by_role',
    },
  ]
  await installStudioApiMock(page, fixture)
  await page.goto(`/organizations/${secondActiveMembership.organization_id}/content`)

  await expect(page.getByText('No puedes consultar este contenido')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Plantillas' })).toHaveCount(0)
})

test('a failed read hides everything rather than looking like an empty gym', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.intercept = (request) =>
    request.path.endsWith('/session-templates')
      ? { status: 503, body: { error: { code: 'upstream-unavailable' } } }
      : undefined
  await installStudioApiMock(page, fixture)
  await openContent(page)

  await expect(page.getByText('No pudimos cargar el contenido')).toBeVisible()
  await expect(page.getByText(/no parezca que la organización no tiene contenido/)).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Plantillas' })).toHaveCount(0)
})
