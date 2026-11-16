import { expect, test } from '@playwright/test'

import { activeMembership, createStudioApiFixture, installStudioApiMock } from './studio-api-mock'

/**
 * HU-STUDIO-082 — finding a person by name in the directory.
 *
 * The narrowing belongs to the server: a coach finds only the people assigned
 * to them because the route reads no further, not because this screen filters.
 * What is checked here is the half the screen owns — that it asks with a term
 * the route accepts, that it never asks for a combination the route refuses,
 * and that an empty answer reads as «nobody by that name» and not as an empty
 * gym.
 */

const ORG = activeMembership.organization_id
const DIRECTORY = `/organizations/${ORG}/clients`
const SEARCH = '#client-directory-search'

test.beforeEach(async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
})

test('finds a person by name and leaves the others out', async ({ page }) => {
  await page.goto(DIRECTORY)
  await expect(page.getByText('Ana Álvarez')).toBeVisible()
  await expect(page.getByText('Bruno Bello')).toBeVisible()

  await page.locator(SEARCH).fill('ana')

  await expect(page.getByText('Ana Álvarez')).toBeVisible()
  await expect(page.getByText('Bruno Bello')).toHaveCount(0)
})

test('ignores accents and case, because the route does', async ({ page }) => {
  await page.goto(DIRECTORY)
  await page.locator(SEARCH).fill('ALVAREZ')
  await expect(page.getByText('Ana Álvarez')).toBeVisible()
})

/*
 * Criterion 4. Saying «todavía no atiendes a nadie» to somebody who mistyped a
 * name would be false, and it is the gym they would go looking for.
 */
test('says nobody matched, and does not read as an empty directory', async ({ page }) => {
  await page.goto(DIRECTORY)
  await expect(page.getByText('Ana Álvarez')).toBeVisible()

  await page.locator(SEARCH).fill('zzz')

  await expect(page.getByText('No encontramos a nadie con ese nombre')).toBeVisible()
  await expect(page.getByText('Todavía no hay personas vinculadas')).toHaveCount(0)
})

/*
 * The route answers 422 to a search among invitations, so the screen must make
 * the combination impossible rather than meet the error. Disabled and not
 * hidden: a control that vanishes leaves the reader looking for it.
 */
test('turns the search off among invitations, saying why, and keeps what was typed', async ({
  page,
}) => {
  const refused: string[] = []
  page.on('response', (response) => {
    if (response.status() === 422 && response.url().includes('/clients')) {
      refused.push(response.url())
    }
  })

  await page.goto(DIRECTORY)
  await page.locator(SEARCH).fill('ana')
  await expect(page.getByText('Bruno Bello')).toHaveCount(0)

  await page.getByRole('button', { name: 'Invitados', exact: true }).click()

  await expect(page.locator(SEARCH)).toBeDisabled()
  await expect(page.locator(SEARCH)).toHaveValue('ana')
  await expect(
    page.getByText('Una invitación sin responder todavía no tiene nombre', { exact: false }),
  ).toBeVisible()
  // The invitation is listed, which is only possible if no term travelled.
  await expect(page.getByText('c***@correo-institucional-muy-largo.example.test')).toBeVisible()
  expect(refused).toEqual([])

  // Going back restores the search instead of having silently dropped it.
  await page.getByRole('button', { name: 'Todos', exact: true }).click()
  await expect(page.locator(SEARCH)).toBeEnabled()
  await expect(page.getByText('Ana Álvarez')).toBeVisible()
  await expect(page.getByText('Bruno Bello')).toHaveCount(0)
})

/*
 * A single letter is a state a person passes through while typing, not an
 * error: nothing is asked for and nothing is said.
 */
test('asks for nothing until the term is long enough', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/clients?') && request.url().includes('q=')) {
      asked.push(request.url())
    }
  })

  await page.goto(DIRECTORY)
  await expect(page.getByText('Ana Álvarez')).toBeVisible()

  await page.locator(SEARCH).fill('a')
  await expect(page.getByText('Bruno Bello')).toBeVisible()
  expect(asked).toEqual([])

  await page.locator(SEARCH).fill('an')
  await expect(page.getByText('Bruno Bello')).toHaveCount(0)
  expect(asked.length).toBeGreaterThan(0)
})
