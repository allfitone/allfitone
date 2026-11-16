/**
 * A gym's own movements, from Studio (HU-STUDIO-064..067).
 *
 * There is no authorization branch here: who may create, edit, archive or search, and
 * what a published version freezes, are decided inside each function's transaction. This
 * layer only composes the demonstration address, which is configuration and not data.
 */

import type {
  CatalogCommandResult,
  OrganizationMovement,
  OrganizationMovementDatabase,
  OrganizationMovementQuery,
  Page,
  StoredOrganizationMovement,
  StudioMovement,
} from '../domain/index.js'

type Database = OrganizationMovementDatabase

export interface OrganizationMovementService {
  search(request: OrganizationMovementQuery): Promise<Page<StudioMovement>>
  read(input: Parameters<Database['read']>[0]): Promise<OrganizationMovement | null>
  create(
    input: Parameters<Database['create']>[0],
  ): Promise<CatalogCommandResult<OrganizationMovement>>
  update(
    input: Parameters<Database['update']>[0],
  ): Promise<CatalogCommandResult<OrganizationMovement>>
  archive(
    input: Parameters<Database['archive']>[0],
  ): Promise<CatalogCommandResult<OrganizationMovement>>
}

export function createOrganizationMovementService({
  database,
  mediaBaseUrl,
}: {
  database: Database
  mediaBaseUrl: string
}): OrganizationMovementService {
  const base = mediaBaseUrl.replace(/\/+$/, '')
  const address = (key: string | null): string | null => (key === null ? null : `${base}/${key}`)
  const movement = ({ demo_object_key, ...rest }: StoredOrganizationMovement) => ({
    ...rest,
    demo_url: address(demo_object_key),
  })
  const command = async (
    run: Promise<CatalogCommandResult<StoredOrganizationMovement>>,
  ): Promise<CatalogCommandResult<OrganizationMovement>> => {
    const { resource, replayed } = await run
    return { resource: movement(resource), replayed }
  }

  return {
    search: async (request) => {
      const found = await database.search(request)
      return {
        data: found.data.map(({ demo_object_key, ...rest }) => ({
          ...rest,
          demo_url: address(demo_object_key),
        })),
        page: found.page,
      }
    },
    read: async (input) => {
      const found = await database.read(input)
      return found ? movement(found) : null
    },
    create: (input) => command(database.create(input)),
    update: (input) => command(database.update(input)),
    archive: (input) => command(database.archive(input)),
  }
}
