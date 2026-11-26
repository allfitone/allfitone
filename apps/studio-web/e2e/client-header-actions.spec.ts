import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  coachedTeam,
  createStudioApiFixture,
  installStudioApiMock,
  secondActiveMembership,
} from './studio-api-mock'

const ORG = activeMembership.organization_id

async function open(page: Page, membership = activeMembership) {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [membership], organizationMemberships: coachedTeam() }),
  )
  await page.goto(`/organizations/${membership.organization_id}/clients`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/**
 * The first acceptance criterion: the header distinguishes what you do from
 * what you consult. Three links drawn the same way, in the same place, said
 * they were three of a kind.
 */
test('the header carries one action, and it is the only thing you do from here', async ({
  page,
}) => {
  await open(page)

  const actions = page.locator('[data-page-header-actions]')
  await expect(actions.getByRole('link')).toHaveCount(1)
  await expect(actions.getByRole('link')).toHaveText('Invitar cliente')
})

/**
 * The consultations open the section rather than closing it: they are tabs
 * above the list now, where the row of links used to sit below it. Asserted on
 * document order, not on pixels.
 */
test('the sections are a strip above the list, not links below it', async ({ page }) => {
  await open(page)

  const order = await page.evaluate(() => {
    const section = document.querySelector('[data-client-page]')
    if (!section) throw new Error('la sección del directorio no está en la página')
    const everything = Array.from(section.querySelectorAll('*'))
    const index = (selector: string) => everything.findIndex((element) => element.matches(selector))
    return {
      header: index('[data-page-header]'),
      tabs: index('[role="tablist"]'),
      filters: index('[data-slot="toggle-group"]'),
      list: index('[data-studio-register="clients"], [data-client-directory-cards]'),
    }
  })

  expect(order.header).toBeGreaterThanOrEqual(0)
  expect(order.tabs).toBeGreaterThan(order.header)
  expect(order.filters).toBeGreaterThan(order.tabs)
  expect(order.list).toBeGreaterThan(order.filters)
})

/**
 * Every section stays reachable from where a person looks for it.
 * «Categorías de información» had no click test at all before the row of links
 * was written, and it was reachable only by typing the address.
 *
 * The heading does not change — one screen, one title — so what says the tab
 * opened is the sentence under it, which names the section.
 */
test('the three consultations are reachable by pressing their tab', async ({ page }) => {
  await open(page)

  const sections = page.getByRole('tablist', { name: 'Secciones de clientes' })
  await expect(sections.getByRole('tab')).toHaveCount(4)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clientes')

  await sections.getByRole('tab', { name: 'Categorías' }).click()
  await expect(page).toHaveURL(`/organizations/${ORG}/clients?tab=categories`)
  await expect(page.getByText(/siete categorías de información fijas/)).toBeVisible()

  await sections.getByRole('tab', { name: 'Autorizaciones' }).click()
  await expect(page).toHaveURL(`/organizations/${ORG}/clients?tab=authorizations`)
  await expect(page.getByText(/Qué autorizó cada persona/)).toBeVisible()

  // The third is the only one about the reader's own work, not about a client.
  await sections.getByRole('tab', { name: 'Propuestas' }).click()
  await expect(page).toHaveURL(`/organizations/${ORG}/clients?tab=proposals`)
  await expect(page.getByText(/correcciones que propusiste/)).toBeVisible()

  // The heading stayed put the whole way: four sections, one screen.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clientes')
})

/**
 * Measured rather than eyeballed, and the reason the labels are one word where
 * the section allows it: four tabs have to fit a 390px phone. The row of links
 * this replaced broke its labels mid-word there, because the shared rule below
 * 640px gave every child an equal share of the width.
 */
test('on a phone no section label is cut off, and the page never scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)

  const measurements = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'))
    return tabs.map((tab) => ({
      text: (tab.textContent ?? '').trim(),
      clipped: tab.scrollWidth > tab.clientWidth + 1,
    }))
  })

  expect(measurements).toHaveLength(4)
  for (const tab of measurements) {
    expect(tab.clipped, `"${tab.text}" quedó recortado`).toBe(false)
  }

  /*
   * The strip may scroll within itself on a phone — that is a shape, not a
   * defect. What must never happen is the page scrolling sideways, which is
   * what makes a reader lose the left edge of everything else.
   */
  const document_ = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(document_.width).toBeLessThanOrEqual(document_.viewport)
})

/**
 * No section depends on being able to invite: a coach who only attends clients
 * still needs to know what may be asked of them — and the register of what he
 * proposed is his own work, which invites have nothing to do with.
 */
test('a role without the invite action keeps the four sections', async ({ page }) => {
  await open(page, secondActiveMembership)

  const sections = page.getByRole('tablist', { name: 'Secciones de clientes' })
  await expect(sections.getByRole('tab', { name: 'Categorías' })).toBeVisible()
  await expect(sections.getByRole('tab', { name: 'Autorizaciones' })).toBeVisible()
  await expect(sections.getByRole('tab', { name: 'Propuestas' })).toBeVisible()
})
