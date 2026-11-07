import { expect, test } from '@playwright/test'

import {
  ACTOR_PERSON_ID,
  SUBJECT_PERSON_ID,
  activeSession,
  createBackofficeFixture,
  mockBackofficeApi,
  platformDuty,
  platformRole,
  standingDuty,
} from './backoffice-api-mock'

const NEW_PERSON_ID = '019a3000-0000-7000-8000-0000000000ff'

function seeded() {
  return {
    roles: [
      platformRole({ person_id: ACTOR_PERSON_ID, granted_by_person_id: SUBJECT_PERSON_ID }),
      platformRole({ person_id: SUBJECT_PERSON_ID }),
    ],
    duties: [
      standingDuty({
        person_id: ACTOR_PERSON_ID,
        duty_code: 'manage_platform_access',
        granted_by_person_id: SUBJECT_PERSON_ID,
      }),
      // A temporary duty from before ADR-046, which still lapses on its own date.
      platformDuty({ person_id: SUBJECT_PERSON_ID, duty_code: 'diagnose_support_metadata' }),
    ],
  }
}

test('shows who reaches the data, with the state and window of every duty', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), platformAccess: seeded() }),
  )

  await page.goto('/team')

  await expect(page.getByRole('heading', { name: 'Rol base' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deberes de plataforma' })).toBeVisible()
  // Scoped to the table: the duty filter's options carry the same names.
  await expect(page.getByRole('cell', { name: 'Administrar accesos de plataforma' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Diagnosticar metadatos de soporte' })).toBeVisible()
  // The duty carries its mode and its required assurance, not just its name.
  await expect(
    page.getByRole('cell', { name: 'Seguridad y privacidad', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('cell', { name: '2', exact: true }).first()).toBeVisible()
})

test('refuses the inventory without a reading duty and says why', async ({ context, page }) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      platformAccess: { ...seeded(), forbidden: true },
    }),
  )

  await page.goto('/team')

  await expect(page.getByText('No puedes ver este inventario')).toBeVisible()
  await expect(page.getByText(/rol de administrador vigente/)).toBeVisible()
})

test('grants a base role, and the role brings every duty with it', async ({ context, page }) => {
  const fixture = createBackofficeFixture({
    session: activeSession(),
    platformAccess: seeded(),
  })
  await mockBackofficeApi(context, fixture)

  await page.goto('/team')
  await expect(page.getByRole('heading', { name: 'Rol base' })).toBeVisible()
  // ADR-046: there is nothing to grant one by one, so the screen offers no duty form.
  await expect(page.getByRole('button', { name: 'Otorgar deber' })).toHaveCount(0)

  await page.getByLabel('Persona que recibe el rol').fill(NEW_PERSON_ID)
  await page.getByRole('button', { name: 'Otorgar rol base' }).click()
  await expect(page.getByText('Rol base otorgado.')).toBeVisible()

  const duties = page
    .getByRole('row')
    .filter({ hasText: NEW_PERSON_ID })
    .filter({ hasText: 'Permanente · rol admin' })
  await expect(duties).toHaveCount(13)
  expect(
    fixture.requests.filter(
      (request) =>
        request.method === 'POST' && request.path === '/backoffice/v1/platform/duty-assignments',
    ),
  ).toHaveLength(0)
})

test('a duty the role brings reads as permanent and offers no action of its own', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), platformAccess: seeded() }),
  )

  await page.goto('/team')

  const standing = page.getByRole('row').filter({ hasText: 'Administrar accesos de plataforma' })
  await expect(standing).toContainText('Permanente · rol admin')
  await expect(standing).toContainText('Sigue al rol')
  // Withdrawing the role is the only way to end it, so nothing here pretends otherwise.
  for (const name of ['Recertificar', 'Suspender', 'Revocar']) {
    await expect(standing.getByRole('button', { name })).toHaveCount(0)
  }
  // A temporary duty from before keeps its actions until it lapses.
  const temporary = page.getByRole('row').filter({ hasText: 'Diagnosticar metadatos de soporte' })
  await expect(temporary.getByRole('button', { name: 'Revocar' })).toHaveCount(1)
})

test('withdrawing the base role closes the duties it carried', async ({ context, page }) => {
  const access = seeded()
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), platformAccess: access }),
  )

  await page.goto('/team')
  await expect(page.getByRole('heading', { name: 'Rol base' })).toBeVisible()

  await page
    .getByRole('row')
    .filter({ hasText: SUBJECT_PERSON_ID })
    .first()
    .getByRole('button', { name: 'Retirar' })
    .click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Retirar el rol' }).click()

  await expect(page.getByText(/Rol base retirado/)).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: SUBJECT_PERSON_ID }).first()).toContainText(
    'Retirado',
  )
  // The duty the person carried is now revoked, not silently missing.
  await expect(page.getByRole('cell', { name: 'Revocado' }).first()).toBeVisible()
})

test('keeping the base role from the confirmation withdraws nothing', async ({ context, page }) => {
  const access = seeded()
  const fixture = createBackofficeFixture({ session: activeSession(), platformAccess: access })
  await mockBackofficeApi(context, fixture)

  await page.goto('/team')
  await expect(page.getByRole('heading', { name: 'Rol base' })).toBeVisible()

  await page
    .getByRole('row')
    .filter({ hasText: SUBJECT_PERSON_ID })
    .first()
    .getByRole('button', { name: 'Retirar' })
    .click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('No se puede deshacer')
  await dialog.getByRole('button', { name: 'Conservar el rol' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('row').filter({ hasText: SUBJECT_PERSON_ID }).first()).toContainText(
    'Vigente',
  )
  expect(
    fixture.requests.filter(
      (request) => request.method === 'POST' && request.path.endsWith('/revocation'),
    ),
  ).toHaveLength(0)
  expect(access.roles[1]?.status).toBe('active')
})

test('keeping a duty from the confirmation revokes nothing', async ({ context, page }) => {
  const access = seeded()
  const fixture = createBackofficeFixture({ session: activeSession(), platformAccess: access })
  await mockBackofficeApi(context, fixture)

  await page.goto('/team')
  await expect(page.getByRole('heading', { name: 'Deberes de plataforma' })).toBeVisible()

  await page
    .getByRole('row')
    .filter({ hasText: SUBJECT_PERSON_ID })
    .filter({ has: page.getByRole('button', { name: 'Revocar' }) })
    .getByRole('button', { name: 'Revocar' })
    .click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('diagnosticar metadatos de soporte')
  await dialog.getByRole('button', { name: 'Conservar el deber' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('cell', { name: 'Revocado' })).toHaveCount(0)
  expect(
    fixture.requests.filter(
      (request) => request.method === 'POST' && request.path.endsWith('/revocation'),
    ),
  ).toHaveLength(0)
  expect(access.duties[1]?.status).toBe('active')
})

test('explains a refused command as an order about oneself or a withdrawn role', async ({
  context,
  page,
}) => {
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      platformAccess: {
        ...seeded(),
        nextCommandFailure: { status: 403, code: 'forbidden' },
      },
    }),
  )

  await page.goto('/team')
  await page.getByLabel('Persona que recibe el rol').fill(NEW_PERSON_ID)
  await page.getByRole('button', { name: 'Otorgar rol base' }).click()

  await expect(page.getByText(/ya no tiene el rol de administrador/)).toBeVisible()
})

test('recertifies a duty in force, and the inventory says who and when', async ({
  context,
  page,
}) => {
  // HU-BO-028 c4 and HU-BO-029 c2: «última recertificación» was always empty.
  const access = seeded()
  const fixture = createBackofficeFixture({ session: activeSession(), platformAccess: access })
  await mockBackofficeApi(context, fixture)

  await page.goto('/team')
  const row = page
    .getByRole('row')
    .filter({ hasText: SUBJECT_PERSON_ID })
    .filter({
      has: page.getByRole('button', { name: 'Recertificar' }),
    })
  await row.getByRole('button', { name: 'Recertificar' }).click()

  await expect(page.getByText(/Deber recertificado/)).toBeVisible()
  const recertifications = fixture.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/recertification'),
  )
  expect(recertifications).toHaveLength(1)
  expect(recertifications[0]?.path).toContain(access.duties[1]?.id ?? 'missing')
  expect(access.duties[1]?.recertified_at).not.toBeNull()
})

test('a duty no longer in force offers no recertification', async ({ context, page }) => {
  const access = seeded()
  access.duties.push(
    platformDuty({
      person_id: SUBJECT_PERSON_ID,
      duty_code: 'view_platform_metrics',
      status: 'revoked',
    }),
  )
  await mockBackofficeApi(
    context,
    createBackofficeFixture({ session: activeSession(), platformAccess: access }),
  )

  await page.goto('/team')
  const revoked = page.getByRole('row').filter({ hasText: 'Ver métricas de plataforma' })
  await expect(revoked).toContainText('Revocado')
  await expect(revoked.getByRole('button', { name: 'Recertificar' })).toHaveCount(0)
})

test('filters the duties by state, asking the API rather than hiding rows', async ({
  context,
  page,
}) => {
  // HU-BO-029 c2: the API filtered; the screen never asked it to.
  const access = seeded()
  access.duties.push(
    platformDuty({
      person_id: SUBJECT_PERSON_ID,
      duty_code: 'view_platform_metrics',
      status: 'suspended',
    }),
  )
  const fixture = createBackofficeFixture({ session: activeSession(), platformAccess: access })
  await mockBackofficeApi(context, fixture)

  await page.goto('/team')
  await page.getByRole('combobox', { name: 'Estado del deber' }).click()
  await page.getByRole('option', { name: 'Suspendido', exact: true }).click()

  // Cells only: the duty filter's selector shows a duty name too, but never as a cell.
  await expect(page.getByRole('cell', { name: 'Ver métricas de plataforma' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Diagnosticar metadatos de soporte' })).toHaveCount(0)
  const filtered = fixture.requests.filter(
    (request) =>
      request.method === 'GET' &&
      request.path === '/backoffice/v1/platform/duty-assignments' &&
      new URLSearchParams(request.query).get('status') === 'suspended',
  )
  expect(filtered.length).toBeGreaterThan(0)
})

test('sends an unauthenticated operator back to the access screen', async ({ context, page }) => {
  await mockBackofficeApi(context, createBackofficeFixture({ platformAccess: seeded() }))

  await page.goto('/team')

  await expect(page.getByRole('heading', { name: 'Identifica tu acceso.' })).toBeVisible()
})

test('reaches the whole inventory instead of showing the first page as if it were all', async ({
  context,
  page,
}) => {
  const roles = Array.from({ length: 5 }, (_, index) =>
    platformRole({ person_id: `019a3000-0000-7000-8000-00000000010${index}` }),
  )
  await mockBackofficeApi(
    context,
    createBackofficeFixture({
      session: activeSession(),
      platformAccess: { roles, duties: [], pageSize: 2 },
    }),
  )

  await page.goto('/team')

  const rows = page.getByRole('row').filter({ hasText: '019a3000-0000-7000-8000-0000000001' })
  await expect(rows).toHaveCount(2)

  const more = page.getByRole('button', { name: 'Ver más asignaciones de rol base' })
  await expect(more).toBeVisible()
  await more.click()
  await expect(rows).toHaveCount(4)

  await more.click()
  await expect(rows).toHaveCount(5)
  // Nothing left to fetch, so the invitation to fetch disappears.
  await expect(more).toBeHidden()
})
