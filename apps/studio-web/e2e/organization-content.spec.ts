import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  publishedProgram,
  publishedTemplate,
  secondActiveMembership,
} from './studio-api-mock'

/*
 * HU-STUDIO-044, the first screen of the content block and the one the other
 * registers copy. Its three criteria are all about telling things apart and
 * keeping them in, and two of them are the database's: this audits the one
 * that is the screen's — a draft is explicitly not a published version — plus
 * the capability gate, every state, and what makes the list a list: its
 * filters, its two views and the tab kept in the address.
 */

const CONTENT_PATH = `/organizations/${activeMembership.organization_id}/content`

function openContent(page: Page) {
  return page.goto(CONTENT_PATH)
}

function card(page: Page, name: string) {
  return page.locator('[data-library-card]', { hasText: name })
}

function status(page: Page, name: string) {
  return card(page, name).locator('[data-library-status]')
}

async function chooseState(page: Page, option: string) {
  await page.getByRole('combobox', { name: 'Estado' }).click()
  await page.getByRole('option', { name: option }).click()
}

test('an owner reads the content, because the catalogue gives them manage_content', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Plantillas' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Programas' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Movimientos' })).toBeVisible()
})

/*
 * Criterion 1, which is the whole of this screen's own work: a draft is not a
 * published version. The badge names the version that can be assigned, never a
 * count — «2 versiones» would hide that one is retired — and the menu keeps the
 * draft and each version as separate things to open.
 */
test('a draft and the published versions are told apart', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await expect(status(page, 'Fuerza tren superior')).toHaveText('Publicada v2')

  await page.getByRole('button', { name: 'Versiones de Fuerza tren superior' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem').first()).toHaveText('Abrir el borrador')
  await expect(menu).toContainText('Versiones publicadas')
})

test('a template with nothing published is a draft, with no version to list', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await expect(status(page, 'Movilidad matutina')).toHaveText('Borrador')
  await expect(page.getByRole('button', { name: 'Versiones de Movilidad matutina' })).toHaveCount(0)
})

// ADR-009: an adaptation keeps its source, so the list says which items are one.
test('a template started from another version is marked as an adaptation', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await expect(card(page, 'Fuerza adaptada')).toContainText('Adaptación')
  await expect(card(page, 'Movilidad matutina')).not.toContainText('Adaptación')
})

test('the versions are listed on demand, newest first, with the retired one marked', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await page.getByRole('button', { name: 'Versiones de Fuerza tren superior' }).click()

  const versions = page.getByRole('menuitem', { name: /^Versión/ })
  await expect(versions).toHaveCount(2)
  await expect(versions.first()).toContainText('Versión 2')
  await expect(versions.last()).toContainText('Versión 1')
  await expect(versions.last()).toContainText('retirada')
})

test('pressing an item opens its draft', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await page.getByRole('link', { name: 'Fuerza tren superior', exact: true }).click()

  await expect(page).toHaveURL(`${CONTENT_PATH}/templates/${publishedTemplate.id}`)
})

test('archived content is out of the list until its state is asked for', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await expect(card(page, 'Circuito antiguo')).toHaveCount(0)

  await chooseState(page, 'Archivadas')

  await expect(status(page, 'Circuito antiguo')).toHaveText('Archivada')
  // And alone: what is archived is never mixed in with what is in use.
  await expect(card(page, 'Fuerza tren superior')).toHaveCount(0)
})

test('the search finds a name whatever its capitals and accents', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await page.getByRole('searchbox', { name: 'Buscar plantillas' }).fill('MOVIL')

  await expect(card(page, 'Movilidad matutina')).toBeVisible()
  await expect(card(page, 'Fuerza tren superior')).toHaveCount(0)
})

test('the discipline and the state narrow the list', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await page.getByRole('combobox', { name: 'Disciplina' }).click()
  await page.getByRole('option', { name: 'Movilidad' }).click()
  await expect(page.locator('[data-library-card]')).toHaveCount(1)
  await expect(card(page, 'Movilidad matutina')).toBeVisible()

  // Movilidad has a draft and nothing published, so asking for published leaves nothing.
  await chooseState(page, 'Publicadas')
  await expect(page.getByText('Ninguna plantilla coincide')).toBeVisible()

  await page.getByRole('button', { name: 'Quitar los filtros' }).click()
  await expect(card(page, 'Fuerza tren superior')).toBeVisible()
})

test('the same list reads as rows, and the choice is kept for the next visit', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await page.getByRole('button', { name: 'Filas' }).click()

  const table = page.getByRole('table', { name: 'Plantillas' })
  const row = table.getByRole('row', { name: /Fuerza tren superior/ })
  await expect(row).toContainText('Fuerza')
  await expect(row).toContainText('Publicada v2')
  await expect(page.locator('[data-library-card]')).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('table', { name: 'Plantillas' })).toBeVisible()
})

test('the programs tab reads its own list', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await page.getByRole('tab', { name: 'Programas' }).click()

  // «Programa» is masculine, and so is its state.
  await expect(status(page, 'Bloque de fuerza')).toHaveText('Publicado v2')
  await expect(card(page, 'Fuerza tren superior')).toHaveCount(0)
})

/*
 * A program version keeps the name it was published under, which a template
 * version does not. The menu says it only when it is no longer the program's:
 * repeating the name the card already shows would say nothing.
 */
test('a program version says its own title when the program was renamed since', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  const renamed = structuredClone(publishedProgram)
  const [newest, oldest] = renamed.versions
  if (!newest || !oldest) throw new Error('the fixture program needs two versions')
  oldest.title = 'Bloque de fuerza inicial'
  fixture.organizationPrograms = [renamed]
  await installStudioApiMock(page, fixture)
  await openContent(page)

  await page.getByRole('tab', { name: 'Programas' }).click()
  await page.getByRole('button', { name: `Versiones de ${newest.title}` }).click()

  const versions = page.getByRole('menuitem', { name: /^Versión/ })
  await expect(versions.last()).toContainText('«Bloque de fuerza inicial»')
  await expect(versions.first()).not.toContainText('«')
})

test('the tab is kept in the address, so going back lands where the reader was', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await page.getByRole('tab', { name: 'Programas' }).click()
  await expect(page).toHaveURL(`${CONTENT_PATH}?tab=programs`)

  await page.getByRole('link', { name: 'Bloque de fuerza', exact: true }).click()
  await expect(page).not.toHaveURL(`${CONTENT_PATH}?tab=programs`)
  await page.goBack()

  await expect(page.getByRole('tab', { name: 'Programas' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(card(page, 'Bloque de fuerza')).toBeVisible()
})

test('an address that names a tab opens on it', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${CONTENT_PATH}?tab=movements`)

  await expect(page.getByRole('tab', { name: 'Movimientos' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Nuevo movimiento' })).toBeVisible()
})

test('one creation button follows the tab', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await openContent(page)

  await expect(page.getByRole('button', { name: 'Nueva plantilla' })).toBeVisible()
  await page.getByRole('tab', { name: 'Programas' }).click()
  await expect(page.getByRole('button', { name: 'Nuevo programa' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nueva plantilla' })).toHaveCount(0)
})

test('each tab has its own empty state, because they differ, and each offers to create', async ({
  page,
}) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.organizationSessionTemplates = []
  fixture.organizationPrograms = []
  await installStudioApiMock(page, fixture)
  await openContent(page)

  // A template is what a program is built out of, so its absence is the one
  // that explains the order to work in.
  await expect(page.getByText(/Todavía no hay plantillas/)).toBeVisible()
  await expect(page.getByText(/un programa se compone de versiones publicadas/)).toBeVisible()
  // Nothing to filter yet, so no toolbar: the way forward is the one button.
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  await page.getByRole('tabpanel').getByRole('button', { name: 'Nueva plantilla' }).click()
  await expect(page.getByRole('dialog', { name: 'Nueva plantilla' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar' }).click()

  await page.getByRole('tab', { name: 'Programas' }).click()
  await expect(page.getByText(/Todavía no hay programas/)).toBeVisible()
})

// The list used to stop at its first page of fifty: the fifty-first never appeared.
test('every page of the list is read, not only the first', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.organizationSessionTemplates = Array.from({ length: 60 }, (_, index) => {
    const template = structuredClone(publishedTemplate)
    const number = String(index + 1).padStart(2, '0')
    template.id = `01991600-a000-7000-8000-0000000001${number}`
    template.draft.content.title = `Plantilla ${number}`
    return template
  })
  await installStudioApiMock(page, fixture)
  await openContent(page)

  await expect(page.locator('[data-library-card]')).toHaveCount(60)
  await expect(card(page, 'Plantilla 60')).toBeVisible()
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

/*
 * Each tab reads its own list now, so a failed read is said in its tab and the
 * others stay reachable. What must not happen is unchanged: a failure never
 * reads as a gym with nothing in it.
 */
test('a failed read is said as a failure, never as an empty gym', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.intercept = (request) =>
    request.path.endsWith('/session-templates')
      ? { status: 503, body: { error: { code: 'upstream-unavailable' } } }
      : undefined
  await installStudioApiMock(page, fixture)
  await openContent(page)

  await expect(page.getByText('No pudimos cargar el contenido')).toBeVisible()
  await expect(page.getByText(/no parezca que la organización no tiene contenido/)).toBeVisible()
  await expect(page.getByText(/Todavía no hay plantillas/)).toHaveCount(0)
  await expect(page.locator('[data-library-card]')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Programas' }).click()
  await expect(card(page, 'Bloque de fuerza')).toBeVisible()
})
