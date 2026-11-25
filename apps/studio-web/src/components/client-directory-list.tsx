'use client'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Avatar, AvatarFallback } from '@allfitone/react/components/avatar'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import { Card, CardContent, CardHeader } from '@allfitone/react/components/card'
import { Input } from '@allfitone/react/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { Spinner } from '@allfitone/react/components/spinner'
import { RegisterCardState } from '@/components/register-card-state'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableState,
} from '@allfitone/react/components/table'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { ClientViewToggle } from './client-views'
import { useOrganizationContext } from './organization-context'
import {
  SEARCH_RAW_LIMIT,
  SEARCH_TOO_LONG_REASON,
  SEARCH_UNAVAILABLE_REASON,
  canSearchWithin,
  canViewClientDirectory,
  clientEntryPath,
  clientInitials,
  directoryEntryId,
  searchTermState,
  searchTermToSend,
  seesEveryClient,
} from '@/lib/client-directory'
import { guestQuotaOf, quotaSummary } from '@/lib/guest-quota'
import { useClientView } from '@/lib/client-view'
import { useCompactTable } from '@/lib/use-compact-table'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { StudioApiError, type ClientDirectoryItem } from '@/lib/studio-api'
import {
  flattenClientPages,
  isStudioForbidden,
  organizationClientsQueryOptions,
  organizationRolesQueryOptions,
  type ClientFilter,
} from '@/lib/studio-query'

type LoadError = 'forbidden' | 'stale-cursor' | 'unavailable'

const PAGE_SIZE = 50
/* Long enough that a name is typed before it is asked for, short enough that
   the list does not feel stuck behind the keyboard. */
const SEARCH_SETTLE_MS = 300
const DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

const FILTERS: ReadonlyArray<{ value: ClientFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'invited', label: 'Invitados' },
  { value: 'terminated', label: 'Finalizados' },
]

/**
 * `initialFilter` is the group the URL asked for. The page remounts this list
 * when that changes, so state may seed from it once and the toggle below stays
 * local and instant.
 */
export function ClientDirectoryList({ initialFilter = 'all' }: { initialFilter?: ClientFilter }) {
  const { current } = useOrganizationContext()
  const { compact, measuredRef } = useCompactTable<HTMLElement>()
  const queryClient = useQueryClient()
  const rolesQuery = useQuery(organizationRolesQueryOptions(current.organization_id))
  const canView = canViewClientDirectory(current.roles, rolesQuery.data?.items)
  const everyClient = seesEveryClient(current.roles, rolesQuery.data?.items)
  const [filter, setFilter] = useState<ClientFilter>(initialFilter)
  const [searchBox, setSearchBox] = useState('')
  /*
   * The box keeps what was typed while the invitations filter is on, so
   * switching back restores the search instead of silently losing it. What
   * does not survive is the request: nothing is sent while searching is
   * unavailable.
   */
  const [view, setView] = useClientView()
  const searchAllowed = canSearchWithin(filter)
  const termState = searchTermState(searchBox)
  const settledBox = useDebouncedValue(searchBox, SEARCH_SETTLE_MS)
  const search = searchAllowed ? searchTermToSend(settledBox) : undefined
  const searching = search !== undefined
  /*
   * What a row leads to depends on who is reading, so the decision travels with
   * the reader instead of a path: `clientEntryPath` says why.
   */
  const reader = { organizationId: current.organization_id, everyClient }
  /* Only what the reader could not work out: why the box is off, or that the
     term is too long. The scope of the search is in the page header. */
  const searchNote = !searchAllowed
    ? SEARCH_UNAVAILABLE_REASON
    : termState === 'too-long'
      ? SEARCH_TOO_LONG_REASON
      : undefined
  const options = organizationClientsQueryOptions(
    current.organization_id,
    filter,
    PAGE_SIZE,
    search,
  )
  const query = useInfiniteQuery({ ...options, enabled: canView })
  const forbidden = isStudioForbidden(query.error)
  const items = forbidden ? [] : flattenClientPages(query.data)
  const quotaLine = forbidden ? undefined : quotaSummary(guestQuotaOf(query.data))
  const loading = (canView && query.isPending) || rolesQuery.isPending
  const loadingMore = query.isFetchingNextPage
  const staleCursor =
    query.isFetchNextPageError &&
    query.error instanceof StudioApiError &&
    query.error.status === 422
  const nextCursor =
    !staleCursor && query.hasNextPage ? (query.data?.pages.at(-1)?.page.next_cursor ?? null) : null
  const error: LoadError | undefined = forbidden
    ? 'forbidden'
    : staleCursor
      ? 'stale-cursor'
      : query.isError
        ? 'unavailable'
        : undefined

  async function retry(): Promise<void> {
    if (error === 'stale-cursor') {
      await queryClient.resetQueries({ queryKey: options.queryKey, exact: true })
      return
    }
    await query.refetch()
  }

  function changeFilter(values: ClientFilter[]) {
    const nextFilter = values[0]
    if (!nextFilter || nextFilter === filter) return
    setFilter(nextFilter)
  }

  if (!rolesQuery.isPending && !canView) {
    return (
      <div data-client-panel>
        <Alert variant="warning">
          <AlertTitle>No tienes acceso a este directorio</AlertTitle>
          <AlertDescription>
            El directorio está disponible para quienes atienden personas o administran la
            organización, y tu rol en {current.display_name} no permite consultar las personas
            vinculadas.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const tableState = loading
    ? {
        state: 'loading' as const,
        title: 'Cargando clientes',
        description: 'Estamos comprobando las personas vinculadas con esta organización.',
      }
    : error === 'forbidden'
      ? {
          state: 'error' as const,
          title: 'No tienes acceso a este directorio',
          description: 'La organización o tus permisos ya no permiten consultar esta información.',
        }
      : error === 'unavailable' && items.length === 0
        ? {
            state: 'error' as const,
            title: 'No pudimos cargar los clientes',
            description: 'La conexión falló de forma temporal. Inténtalo de nuevo.',
            action: (
              <Button size="sm" variant="outline" onClick={() => void retry()}>
                Reintentar
              </Button>
            ),
          }
        : items.length === 0
          ? {
              state: 'empty' as const,
              title: emptyTitle(filter, everyClient, searching),
              description: emptyDescription(filter, everyClient, searching),
            }
          : undefined

  return (
    <div ref={measuredRef} data-client-panel>
      {/* Counted over the whole gym whatever the filter or the caller's narrowing. */}
      {quotaLine ? <p data-guest-quota-summary>{quotaLine}</p> : null}

      {/* One row, as the library's is: the box carries its own label, and the
          sentence that used to sit under it said the scope the page header
          already states. What is left is the note below, which only appears
          when there is something exceptional to say. */}
      <div data-client-toolbar>
        <Input
          id="client-directory-search"
          name="q"
          type="search"
          autoComplete="off"
          maxLength={SEARCH_RAW_LIMIT}
          aria-label="Buscar por nombre"
          placeholder="Nombre de la persona"
          value={searchBox}
          disabled={!searchAllowed}
          onChange={(event) => setSearchBox(event.target.value)}
          aria-describedby={searchNote ? 'client-directory-search-note' : undefined}
          data-client-search
        />

        {/* A picker, like the library's, and not a row of four buttons: four
            of them took a third of the toolbar and wrapped onto a line of
            their own on anything narrower than a laptop. */}
        <Select
          value={filter}
          onValueChange={(value) => {
            const next = FILTERS.find((option) => option.value === value)?.value
            if (next) changeFilter([next])
          }}
          items={FILTERS}
        >
          <SelectTrigger aria-label="Filtrar clientes por estado" data-client-filter>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ClientViewToggle view={view} onChange={setView} />
      </div>

      {/* Disabled rather than hidden while the invitations filter is on: a
          control that disappears leaves the reader hunting for why. The reason
          has to be said, so it is said here. */}
      {searchNote ? (
        <p id="client-directory-search-note" data-client-search-note>
          {searchNote}
        </p>
      ) : null}

      {query.isFetching && !loading && !loadingMore ? (
        <p data-query-refreshing role="status" aria-live="polite">
          Actualizando clientes…
        </p>
      ) : null}

      {/* Four columns do not fit the space a narrow register has, so it gets the
          same data as cards, whatever the reader chose: a preference cannot
          conjure room. Only one presentation is rendered — see
          useCompactTable. */}
      {compact || view === 'cards' ? (
        <div data-client-directory-cards aria-label="Clientes" aria-busy={loading || undefined}>
          {tableState ? (
            <RegisterCardState
              {...tableState}
              action={'action' in tableState ? tableState.action : undefined}
            />
          ) : (
            <ul data-client-directory-card-list>
              {items.map((entry) => (
                <li key={directoryEntryId(entry)}>
                  <ClientCard entry={entry} reader={reader} />
                </li>
              ))}
            </ul>
          )}
          <p data-client-directory-note>{DIRECTORY_NOTE}</p>
        </div>
      ) : (
        <Table
          aria-label="Clientes"
          aria-busy={loading || loadingMore || undefined}
          scrollAreaLabel="Tabla de clientes de la organización"
          data-studio-register="clients"
        >
          {/* Filtering must not move the columns under the reader. */}
          <colgroup>
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <TableCaption>{DIRECTORY_NOTE}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead>Finalización</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableState ? (
              <TableState colSpan={4} {...tableState} />
            ) : (
              items.map((entry) => (
                <ClientRow key={directoryEntryId(entry)} entry={entry} reader={reader} />
              ))
            )}
          </TableBody>
        </Table>
      )}

      {error === 'stale-cursor' || (error === 'unavailable' && items.length > 0) ? (
        <Alert variant={error === 'stale-cursor' ? 'info' : 'danger'} live="polite">
          <AlertTitle>
            {error === 'stale-cursor' ? 'El directorio cambió' : 'No pudimos cargar más clientes'}
          </AlertTitle>
          <AlertDescription>
            {error === 'stale-cursor'
              ? 'Actualiza la lista para verla desde el inicio.'
              : 'Los clientes que ya cargaste permanecen visibles.'}
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void retry()}>
              {error === 'stale-cursor' ? 'Actualizar la lista' : 'Reintentar'}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {nextCursor ? (
        <div data-client-pagination>
          <Button
            variant="outline"
            disabled={loadingMore}
            onClick={() => void query.fetchNextPage()}
          >
            {loadingMore ? <Spinner label="Cargando más clientes" /> : null}
            {loadingMore ? 'Cargando…' : 'Ver más'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

const DIRECTORY_NOTE =
  'Esta vista presenta el vínculo con cada persona y no expone ningún dato de entrenamiento, salud ni nutrición.'

function ClientCard({
  entry,
  reader,
}: {
  entry: ClientDirectoryItem
  reader: { organizationId: string; everyClient: boolean }
}) {
  return (
    <Card data-client-card>
      <CardHeader>
        {/* The same `strong` the table row uses, carrying the heading role so a
            list of cards can be navigated by name. */}
        <div data-client-identity>
          <Avatar decorative>
            <AvatarFallback>
              {entry.kind === 'invitation' ? '@' : clientInitials(entry.display_name)}
            </AvatarFallback>
          </Avatar>
          <strong role="heading" aria-level={3}>
            {entry.kind === 'invitation' ? (
              entry.contact_hint
            ) : (
              <Link href={clientEntryPath(entry, reader)} data-client-open>
                {entry.display_name}
              </Link>
            )}
          </strong>
        </div>
      </CardHeader>
      <CardContent>
        {/* Every fact is named, so a badge reading "Invitado" is never left
            beside a date with nothing saying what the date is. */}
        <dl data-client-facts>
          <dt>Estado</dt>
          <dd>
            <EntryStatusBadge entry={entry} />
          </dd>

          <dt>{entry.kind === 'invitation' ? 'Invitación enviada' : 'Vínculo desde'}</dt>
          <dd>{formatDate(entry.kind === 'invitation' ? entry.invited_at : entry.started_at)}</dd>

          {entry.kind === 'relationship' && entry.ended_at ? (
            <>
              <dt>Finalización</dt>
              <dd>{formatDate(entry.ended_at)}</dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  )
}

/*
 * The name is the link, rather than a fifth column holding a "Ver" button. The
 * column shares above are tuned to four, and an invitation entry would have an
 * empty cell in the fifth: nobody has accepted, so there is no relationship to
 * open yet.
 */
function ClientRow({
  entry,
  reader,
}: {
  entry: ClientDirectoryItem
  reader: { organizationId: string; everyClient: boolean }
}) {
  return (
    <TableRow>
      <TableCell>
        <div data-client-identity>
          <Avatar decorative>
            <AvatarFallback>
              {entry.kind === 'invitation' ? '@' : clientInitials(entry.display_name)}
            </AvatarFallback>
          </Avatar>
          {entry.kind === 'invitation' ? (
            <strong>{entry.contact_hint}</strong>
          ) : (
            <strong>
              <Link href={clientEntryPath(entry, reader)} data-client-open>
                {entry.display_name}
              </Link>
            </strong>
          )}
        </div>
      </TableCell>
      <TableCell>
        <EntryStatusBadge entry={entry} />
      </TableCell>
      <TableCell>
        {formatDate(entry.kind === 'invitation' ? entry.invited_at : entry.started_at)}
      </TableCell>
      <TableCell>
        {entry.kind === 'relationship' && entry.ended_at ? formatDate(entry.ended_at) : '—'}
      </TableCell>
    </TableRow>
  )
}

/**
 * The story asks for relationship state and invitation state. They are one
 * column rather than two because they never vary independently: a relationship
 * exists only because somebody accepted, so its invitation is always accepted,
 * and an entry that is still an invitation has no relationship yet. Two columns
 * would spend a whole column saying "aceptada" on every row that has a person.
 */
function EntryStatusBadge({ entry }: { entry: ClientDirectoryItem }) {
  if (entry.kind === 'invitation') {
    /*
     * "Invitado", not "Invitación pendiente". The column and the card label
     * both already say "Estado", so the longer wording spent its width
     * repeating them — and on a phone it did not fit, painting over the cell
     * beside it. One word, parallel with "Activo" and "Terminado", and the
     * same word the filter uses.
     *
     * Amber rather than success or danger: nobody has done anything wrong, the
     * person simply has not answered yet.
     */
    return <Badge variant="warning">Invitado</Badge>
  }
  return (
    <Badge variant={entry.relationship_status === 'active' ? 'success' : 'secondary'}>
      {entry.relationship_status === 'active' ? 'Activo' : 'Terminado'}
    </Badge>
  )
}

/*
 * A search that found nobody is not an empty directory, and saying «todavía no
 * atiendes a nadie» to someone who just mistyped a name would be false. So the
 * search answers first, whatever the filter.
 */
function emptyTitle(filter: ClientFilter, everyClient: boolean, searching: boolean): string {
  if (searching) return 'No encontramos a nadie con ese nombre'
  if (filter === 'invited') return 'No hay invitaciones sin responder'
  if (filter === 'active') return 'No hay clientes activos'
  if (filter === 'terminated') return 'No hay vínculos finalizados'
  return everyClient ? 'Todavía no hay personas vinculadas' : 'Todavía no atiendes a nadie'
}

function emptyDescription(filter: ClientFilter, everyClient: boolean, searching: boolean): string {
  if (searching) {
    return everyClient
      ? 'Revisa cómo está escrito, o borra la búsqueda para ver todo el directorio.'
      : 'La búsqueda solo alcanza a las personas que atiendes. Revisa cómo está escrito, o borra la búsqueda.'
  }
  return filter === 'all'
    ? 'Cuando invites a alguien y acepte, aparecerá aquí.'
    : 'Cambia el filtro para consultar otro estado.'
}

function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value))
}
