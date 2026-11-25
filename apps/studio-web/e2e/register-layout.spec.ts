import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  clientCard,
  coachedTeam,
  createStudioApiFixture,
  installStudioApiMock,
  relationshipState,
} from './studio-api-mock'

const ORG = activeMembership.organization_id

/**
 * Every register that answers with a table when it has the room: its route, the
 * section that holds it, and the list it falls back to when it does not.
 */
const REGISTERS = [
  {
    name: 'clients',
    path: `/organizations/${ORG}/clients`,
    section: '[data-client-page]',
    cards: '[data-client-directory-card-list]',
  },
  {
    name: 'billing',
    path: `/organizations/${ORG}/billing`,
    section: '[data-billing-page]',
    cards: '[data-billing-card-list]',
  },
  {
    name: 'team',
    path: `/organizations/${ORG}/team`,
    section: '[data-team-page]',
    cards: '[data-team-directory-card-list]',
  },
  {
    name: 'invitations',
    path: `/organizations/${ORG}/team?tab=invitations`,
    section: '[data-team-page]',
    cards: '[data-team-directory-card-list]',
  },
  {
    name: 'authorizations',
    path: `/organizations/${ORG}/clients?tab=authorizations`,
    section: '[data-client-page]',
    cards: '[data-authorized-scope-card-list]',
  },
  {
    name: 'relationship',
    path: `/organizations/${ORG}/clients/${relationshipState.relationship_id}`,
    section: '[data-relationship-state]',
    cards: '[data-relationship-grant-cards]',
  },
  /*
   * The first register that is not the page but a panel inside a list of them,
   * and the first to carry one table per item. It is here because its first
   * version took the whole screen 372px past a phone: a grid item does not
   * shrink below its content, and the content was a table demanding 44rem. The
   * sweep below is what sees that at every width and both sidebar states.
   */
  {
    name: 'programas asignados',
    path: `/organizations/${ORG}/clients/people/${clientCard.person_id}/programs`,
    section: '[data-client-programs-screen]',
    /* One list per program, and the helper reads one element: the first panel
       answers for all three, which the one rule that spaces them draws. */
    cards: '[data-client-programs-list] > li:first-child [data-client-program-session-cards]',
  },
] as const

const fixture = () =>
  createStudioApiFixture({
    memberships: [activeMembership],
    organizationMemberships: coachedTeam(),
    relationshipState,
  })

async function open(page: Page, path: string) {
  await installStudioApiMock(page, fixture())
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/** What the table on screen demands against the room it was given, or null for cards. */
async function fit(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('[data-slot="table-container"]')
    if (!container) return null
    return {
      needs: Math.ceil(container.scrollWidth),
      has: Math.floor(container.clientWidth),
    }
  })
}

/**
 * The gap a container declares, and the gaps its children really stand apart.
 * Measured gaps may exceed the declared one — a child can carry its own margin
 * — but never fall short of it.
 *
 * Read under a poll, and the reason is not slowness. Every gap in this file is
 * `var(--afo-space-N)`, a Design System token, and a `gap` whose variable has
 * not resolved yet computes to `normal` — `Number.parseFloat('normal')` is
 * `NaN`. On a loaded runner one measurement landed in that instant and the
 * suite failed on `NaN`. No timeout would have helped: a plain `expect` over a
 * number does not retry, so the measurement itself has to.
 */
async function spacing(page: Page, selector: string, name: string) {
  const read = () =>
    page.locator(selector).evaluate((element) => {
      const declared = Number.parseFloat(getComputedStyle(element).rowGap)
      const gaps: number[] = []
      let previousBottom: number | null = null
      for (const child of Array.from(element.children)) {
        const box = child.getBoundingClientRect()
        if (previousBottom !== null) gaps.push(Math.round(box.top - previousBottom))
        previousBottom = box.bottom
      }
      return { declared, gaps }
    })

  let measured = { declared: Number.NaN, gaps: [] as number[] }
  await expect
    .poll(
      async () => {
        measured = await read()
        return measured.declared
      },
      { message: `${name}: la separación declarada nunca llegó a ser un número` },
    )
    .toBeGreaterThan(0)
  return measured
}

/*
 * The defect this suite exists for. The rule it replaces asked the viewport,
 * which cannot see the sidebar: at 980px with the sidebar expanded a register
 * had 688px of room, below what its table needed, and scrolled sideways rather
 * than falling back to cards. Both sidebar states are swept because the
 * viewport alone decides neither — there is more room at 760px with the sidebar
 * gone than at 980px with it open.
 */
for (const { name, path } of REGISTERS) {
  test(`T-REGISTER-01 ${name} never scrolls sideways, whatever the sidebar is doing`, async ({
    page,
  }) => {
    for (const width of [1600, 1280, 1100, 980, 860, 760, 600, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await open(page, path)

      for (const sidebar of ['como venga', 'al revés']) {
        if (sidebar === 'al revés') {
          const toggle = page.getByRole('button', { name: 'Abrir o cerrar navegación' })
          if (await toggle.isVisible()) {
            await toggle.click()
            await page.waitForTimeout(350)
          }
        }

        const room = await fit(page)
        if (!room) continue
        expect(
          room.needs,
          `${width}px (${sidebar}): the table needs ${room.needs}px and has ${room.has}px`,
        ).toBeLessThanOrEqual(room.has)
      }
    }
  })
}

/*
 * The other half. A rule that only ever errs towards cards would pass the sweep
 * above and throw away the columns on a desktop.
 */
test('T-REGISTER-02 a register with room keeps its table', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  for (const { name, path } of REGISTERS) {
    await open(page, path)
    await expect(page.locator('table').first(), name).toBeVisible()
  }
})

/*
 * The fallback has to be reversible. Because the register remembers the width
 * that overflowed and waits for more room before trying the table again, a bug
 * in that memory would leave a window stuck on cards after it was widened back
 * — the kind of thing a sweep that only ever narrows never sees.
 */
test('T-REGISTER-03 the table comes back when the room does', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, `/organizations/${ORG}/clients`)
  await expect(page.locator('table')).toHaveCount(0)

  await page.setViewportSize({ width: 1600, height: 900 })
  await expect(page.locator('table').first()).toBeVisible()
})

/*
 * Billing was missing from the rule that stacks a register's own parts, so its
 * description, its filters and its table sat flush against one another at every
 * width — in the table as much as in the cards. The defect was not a wrong
 * value, it was a register left out of a shared rule, which is why this checks
 * every register rather than that one.
 */
test('T-REGISTER-04 a register stands its own parts apart', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })

  for (const { name, path, section } of REGISTERS) {
    await open(page, path)
    const measured = await spacing(page, section, name)
    expect(measured.declared, `${name}: the section declares no gap`).toBeGreaterThan(0)
    for (const gap of measured.gaps) {
      expect(gap, `${name}: parts ${gap}px apart`).toBeGreaterThanOrEqual(
        Math.round(measured.declared),
      )
    }
  }
})

/*
 * The same omission one level down: the cards a register falls back to were
 * flush against each other and against the note below them.
 *
 * Two things are checked, because one register can only answer for one of them:
 * that the rule declares a gap at all, which is what billing was missing and
 * what it can show with its single card, and that the cards on screen really
 * stand that far apart, which needs a register the fixture gives two rows. A
 * register whose fixture gives it nothing renders its empty state instead and
 * has no list to read.
 */
test('T-REGISTER-05 the cards a register falls back to are separated', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let rulesChecked = 0
  let pairsChecked = 0

  for (const { name, path, cards } of REGISTERS) {
    await open(page, path)
    await expect(page.locator('table')).toHaveCount(0)
    if ((await page.locator(cards).count()) === 0) continue

    const measured = await spacing(page, cards, name)
    rulesChecked += 1
    expect(measured.declared, `${name}: the rule declares no gap`).toBeGreaterThan(0)
    for (const gap of measured.gaps) {
      pairsChecked += 1
      expect(gap, `${name}: cards ${gap}px apart`).toBe(Math.round(measured.declared))
    }
  }

  // Otherwise a fixture that stopped returning rows would make this test pass
  // without having read a single rule or compared a single pair of cards.
  expect(rulesChecked, 'ningún registro llegó a mostrar su lista').toBeGreaterThan(0)
  expect(pairsChecked, 'ningún registro tenía dos tarjetas que comparar').toBeGreaterThan(0)
})

const invitation = (id: string, status: string) => ({
  id,
  status,
  channel: 'email',
  contact: `${id}@example.test`,
  created_at: '2026-09-01T00:00:00.000Z',
  expires_at: '2030-09-20T00:00:00.000Z',
  intents: [{ id: `${id}-intent`, kind: 'membership', status, proposed_role_code: 'staff' }],
})

/*
 * A register's cards come in two shapes, and both defects this covers were
 * found by looking at the invitations: only a pending one carries «Revocar».
 *
 * The grid stretches each item to the tallest in its row, but the card inside
 * an item is not the item — the one beside a pending invitation stopped 44px
 * short of its own cell, so a row read as two sizes. And the action needs the
 * gap its card does not pad for: it sat flush against the last fact.
 */
test('cards sharing a row share its height, and an action stands clear of the facts', async ({
  page,
}) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({
      memberships: [activeMembership],
      intercept: (request) =>
        request.method === 'GET' && /\/invitations(\?|$)/.test(request.path)
          ? {
              status: 200,
              body: {
                data: [
                  invitation('pendiente', 'pending'),
                  invitation('decidida', 'completed'),
                  invitation('revocada', 'revoked'),
                  invitation('vencida', 'expired'),
                ],
                page: { next_cursor: null },
              },
            }
          : undefined,
    }),
  )
  // Wide enough for two cards abreast, narrow enough that the table does not fit.
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.goto(`/organizations/${ORG}/team?tab=invitations`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const list = page.locator('[data-team-directory-card-list]')
  await expect(list, 'the invitations did not fall back to cards at this width').toBeVisible()

  const rows = await list.evaluate((element) => {
    const byRow = new Map<number, number[]>()
    for (const item of Array.from(element.children)) {
      const card = item.firstElementChild
      if (!card) continue
      const top = Math.round(item.getBoundingClientRect().top)
      byRow.set(top, [...(byRow.get(top) ?? []), Math.round(card.getBoundingClientRect().height)])
    }
    return [...byRow.values()].filter((heights) => heights.length > 1)
  })

  expect(rows.length, 'no row held two cards to compare').toBeGreaterThan(0)
  for (const heights of rows) {
    expect(new Set(heights).size, `one row drew cards of ${heights.join(' and ')}px`).toBe(1)
  }

  const clearance = await page
    .locator('[data-team-invitation-actions]')
    .first()
    .evaluate((action) => {
      const facts = action.previousElementSibling
      if (!facts) return null
      return Math.round(action.getBoundingClientRect().top - facts.getBoundingClientRect().bottom)
    })
  expect(clearance, 'the action sat against the fact above it').toBeGreaterThanOrEqual(8)
})
