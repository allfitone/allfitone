'use client'

/**
 * The library: what the gym has made and what it plans with.
 *
 * `HU-STUDIO-044`, and the screen the other registers copy, so its shape is
 * decided once. Three tabs rather than three sidebar entries, each with one
 * toolbar: a search, its filters and the switch between cards and rows. One
 * creation button that follows the tab, opening a dialog over the list. The
 * address names the tab, so a link back lands where the reader came from.
 *
 * A template or a program shows one state, as a badge: the draft and the
 * published versions stay apart (criterion 1) because the badge names the
 * version that can be assigned and the menu lists each version to read, while
 * pressing the item opens the draft.
 *
 * Nothing here filters by organization; `planning.list_session_templates` and
 * its program sibling are organization-scoped and `security definer`, and a
 * second filter would be a second place for that rule to be wrong.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@allfitone/react/components/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { IconButton } from '@allfitone/react/components/icon-button'
import { Input } from '@allfitone/react/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@allfitone/react/components/tabs'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { LibrarySkeleton, LibraryViewToggle } from './library-views'
import { MovementCreateDialog } from './movement-create'
import { MovementLibrary } from './movement-library'
import { useOrganizationContext } from './organization-context'
import { ProgramCreateDialog } from './program-create'
import { SessionTemplateCreateDialog } from './session-template-create'
import { WorkspacePageHeader } from './workspace-page-header'
import {
  NO_CONTENT_FILTERS,
  contentHref,
  contentStatus,
  contentStatusLabel,
  editedAt,
  filterContent,
  filtersNarrow,
  libraryPath,
  libraryTabFromQuery,
  programShape,
  type ContentFilters,
  type ContentKind,
  type ContentStateFilter,
  type ContentStatus,
  type LibraryTab,
  type LibraryView,
} from '@/lib/content-library'
import { disciplineName } from '@/lib/movement-search'
import {
  canManageContent,
  isAdaptation,
  programItems,
  templateItems,
  type ContentItem,
  type ContentVersion,
} from '@/lib/organization-content'
import { disciplineOptions } from '@/lib/session-template-create'
import type { CatalogDiscipline } from '@/lib/studio-api'
import {
  catalogDisciplinesQueryOptions,
  isStudioForbidden,
  organizationProgramPagesQueryOptions,
  organizationRolesQueryOptions,
  organizationSessionTemplatePagesQueryOptions,
} from '@/lib/studio-query'
import { useCompactTable } from '@/lib/use-compact-table'
import { useLibraryView } from '@/lib/use-library-view'

const PAGE_SIZE = 50
const EVERY_DISCIPLINE = 'all'

const CREATE_LABEL: Record<LibraryTab, string> = {
  templates: 'Nueva plantilla',
  programs: 'Nuevo programa',
  movements: 'Nuevo movimiento',
}

export function OrganizationContent({
  initialCreate = null,
}: {
  initialCreate?: LibraryTab | null
}) {
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  // The address is the only place the tab lives, so going back restores it.
  const tab = libraryTabFromQuery(useSearchParams().get('tab') ?? undefined)
  const [creating, setCreating] = useState<LibraryTab | null>(initialCreate)
  const [view, setView] = useLibraryView()

  const allowed = canManageContent(current.roles, rolesQuery.data?.items)

  // Next keeps `useSearchParams` in step with the history API: no navigation, no reload.
  function showTab(next: LibraryTab): void {
    window.history.replaceState(null, '', libraryPath(organizationId, next))
  }

  // A request to create is answered once: going back must not open the dialog again.
  useEffect(() => {
    if (initialCreate) {
      window.history.replaceState(null, '', libraryPath(organizationId, initialCreate))
    }
  }, [initialCreate, organizationId])

  function closeCreate(open: boolean): void {
    if (!open) setCreating(null)
  }

  // The capability is read first: the screen says no, where two reads coming
  // back `403` would explain as a failure what was really a permission.
  if (!rolesQuery.isPending && !allowed) {
    return (
      <section data-content-page aria-label="Biblioteca">
        <WorkspacePageHeader description="El contenido de entrenamiento está disponible para quienes lo crean y publican." />
        <Alert variant="warning">
          <AlertTitle>No puedes consultar este contenido</AlertTitle>
          <AlertDescription>
            Tu rol en {current.display_name} no permite ver sus plantillas ni sus programas.
          </AlertDescription>
        </Alert>
      </section>
    )
  }

  const create = allowed ? () => setCreating(tab) : undefined

  return (
    <section data-content-page="library" aria-label="Biblioteca">
      <WorkspacePageHeader
        description={`Las plantillas de sesión, los programas y los movimientos de ${current.display_name}.`}
        actions={
          create ? (
            <Button onClick={create} data-library-create-action>
              <FoundationIcon name="add" decorative />
              {CREATE_LABEL[tab]}
            </Button>
          ) : undefined
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          showTab(libraryTabFromQuery(typeof value === 'string' ? value : undefined))
        }
        data-content-tabs
      >
        <TabsList variant="line" aria-label="Secciones de la biblioteca">
          <TabsTrigger value="templates">Plantillas</TabsTrigger>
          <TabsTrigger value="programs">Programas</TabsTrigger>
          <TabsTrigger value="movements">Movimientos</TabsTrigger>
        </TabsList>
        {/* A panel is mounted only while open, so nothing is read for a tab
            nobody looked at. */}
        <TabsContent value="templates">
          <TemplateLibrary view={view} onViewChange={setView} onCreate={create} />
        </TabsContent>
        <TabsContent value="programs">
          <ProgramLibrary view={view} onViewChange={setView} onCreate={create} />
        </TabsContent>
        <TabsContent value="movements">
          <MovementLibrary view={view} onViewChange={setView} />
        </TabsContent>
      </Tabs>

      {/* A request that came by address waits for the roles: no form for a role that may not create. */}
      <SessionTemplateCreateDialog
        open={allowed && creating === 'templates'}
        onOpenChange={closeCreate}
      />
      <ProgramCreateDialog open={allowed && creating === 'programs'} onOpenChange={closeCreate} />
      <MovementCreateDialog open={allowed && creating === 'movements'} onOpenChange={closeCreate} />
    </section>
  )
}

interface LibraryPanelProps {
  view: LibraryView
  onViewChange: (view: LibraryView) => void
  /** Absent for a role that may not create, and until the roles are known. */
  onCreate: (() => void) | undefined
}

/**
 * Every page of a listing, one after another. The filters search what is
 * loaded, so stopping at the first page would hide what the second holds.
 */
function useEveryPage(query: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isError: boolean
  fetchNextPage: () => unknown
}): void {
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage])
}

function TemplateLibrary(props: LibraryPanelProps) {
  const { current } = useOrganizationContext()
  const query = useInfiniteQuery(
    organizationSessionTemplatePagesQueryOptions(current.organization_id, PAGE_SIZE),
  )
  const disciplinesQuery = useQuery(catalogDisciplinesQueryOptions())
  useEveryPage(query)

  return (
    <ContentRegister
      {...props}
      kind="templates"
      items={templateItems(query.data?.pages.flatMap((page) => page.data) ?? [])}
      disciplines={disciplinesQuery.data?.items}
      basePath={`/organizations/${current.organization_id}/content/templates`}
      loading={query.isPending || query.hasNextPage}
      refreshing={query.isFetching && !query.isPending && !query.hasNextPage}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  )
}

function ProgramLibrary(props: LibraryPanelProps) {
  const { current } = useOrganizationContext()
  const query = useInfiniteQuery(
    organizationProgramPagesQueryOptions(current.organization_id, PAGE_SIZE),
  )
  useEveryPage(query)

  return (
    <ContentRegister
      {...props}
      kind="programs"
      items={programItems(query.data?.pages.flatMap((page) => page.data) ?? [])}
      disciplines={undefined}
      basePath={`/organizations/${current.organization_id}/content/programs`}
      loading={query.isPending || query.hasNextPage}
      refreshing={query.isFetching && !query.isPending && !query.hasNextPage}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  )
}

const KIND_COPY: Record<
  ContentKind,
  {
    list: string
    search: string
    loading: string
    emptyTitle: string
    emptyDescription: string
    noMatch: string
    secondColumn: string
  }
> = {
  templates: {
    list: 'Plantillas',
    search: 'Buscar plantillas',
    loading: 'Cargando las plantillas',
    emptyTitle: 'Todavía no hay plantillas de sesión',
    emptyDescription:
      'Una plantilla es una sesión que se puede reutilizar. Es lo primero que hace falta: un programa se compone de versiones publicadas de plantillas.',
    noMatch: 'Ninguna plantilla coincide',
    secondColumn: 'Disciplina',
  },
  programs: {
    list: 'Programas',
    search: 'Buscar programas',
    loading: 'Cargando los programas',
    emptyTitle: 'Todavía no hay programas',
    emptyDescription:
      'Un programa ordena en semanas y días las versiones publicadas de vuestras plantillas, y es lo que se le asigna a una persona.',
    noMatch: 'Ningún programa coincide',
    secondColumn: 'Sesiones',
  },
}

function stateOptions(kind: ContentKind): Array<{ value: ContentStateFilter; label: string }> {
  const feminine = kind === 'templates'
  return [
    { value: 'current', label: feminine ? 'Activas' : 'Activos' },
    { value: 'draft', label: 'Borradores' },
    { value: 'published', label: feminine ? 'Publicadas' : 'Publicados' },
    { value: 'archived', label: feminine ? 'Archivadas' : 'Archivados' },
  ]
}

function ContentRegister({
  kind,
  items,
  disciplines,
  basePath,
  loading,
  refreshing,
  error,
  onRetry,
  view,
  onViewChange,
  onCreate,
}: LibraryPanelProps & {
  kind: ContentKind
  items: ContentItem[]
  /** Undefined for programs, which belong to no discipline. */
  disciplines: readonly CatalogDiscipline[] | undefined
  basePath: string
  loading: boolean
  refreshing: boolean
  error: unknown
  onRetry: () => void
}) {
  const copy = KIND_COPY[kind]
  const { compact, measuredRef } = useCompactTable<HTMLDivElement>()
  const [filters, setFilters] = useState<ContentFilters>(NO_CONTENT_FILTERS)
  const states = stateOptions(kind)
  const disciplineChoices = [
    { value: EVERY_DISCIPLINE, label: 'Todas las disciplinas' },
    ...disciplineOptions(disciplines ?? []),
  ]

  if (error) {
    return isStudioForbidden(error) ? (
      <Alert variant="warning">
        <AlertTitle>No puedes consultar este contenido</AlertTitle>
        <AlertDescription>La organización o tu membresía ya no están disponibles.</AlertDescription>
      </Alert>
    ) : (
      <Alert variant="danger" live="polite">
        <AlertTitle>No pudimos cargar el contenido</AlertTitle>
        <AlertDescription>
          La conexión falló de forma temporal. Nada se muestra hasta comprobarlo de nuevo, para que
          no parezca que la organización no tiene contenido.
        </AlertDescription>
        <AlertAction>
          <Button variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  if (loading) return <LibrarySkeleton label={copy.loading} />

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="library" decorative />
          </EmptyMedia>
          <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
          <EmptyDescription>{copy.emptyDescription}</EmptyDescription>
        </EmptyHeader>
        {onCreate ? (
          <EmptyContent>
            <Button onClick={onCreate}>
              <FoundationIcon name="add" decorative />
              {CREATE_LABEL[kind]}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    )
  }

  const shown = filterContent(items, filters)
  // Rows that do not fit fall back to cards, whatever was chosen.
  const rows = view === 'rows' && !compact

  return (
    <div data-content-panel ref={measuredRef}>
      <div data-library-toolbar>
        <Input
          type="search"
          name="q"
          autoComplete="off"
          aria-label={copy.search}
          placeholder="Buscar por nombre"
          value={filters.term}
          onChange={(event) => setFilters({ ...filters, term: event.target.value })}
          data-library-search
        />
        {disciplines ? (
          <Select
            value={filters.disciplineCode ?? EVERY_DISCIPLINE}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                disciplineCode: !value || value === EVERY_DISCIPLINE ? null : value,
              })
            }
            items={disciplineChoices}
          >
            <SelectTrigger aria-label="Disciplina" data-library-filter>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {disciplineChoices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select
          value={filters.state}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              state: states.find((state) => state.value === value)?.value ?? 'current',
            })
          }
          items={states}
        >
          <SelectTrigger aria-label="Estado" data-library-filter>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {states.map((state) => (
              <SelectItem key={state.value} value={state.value}>
                {state.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <LibraryViewToggle view={view} onChange={onViewChange} />
      </div>

      {refreshing ? (
        <p data-query-refreshing role="status" aria-live="polite">
          Actualizando el contenido…
        </p>
      ) : null}

      {shown.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="search" decorative />
            </EmptyMedia>
            <EmptyTitle>{copy.noMatch}</EmptyTitle>
            <EmptyDescription>Cambia la búsqueda o los filtros para ver más.</EmptyDescription>
          </EmptyHeader>
          {filtersNarrow(filters) ? (
            <EmptyContent>
              <Button variant="outline" onClick={() => setFilters(NO_CONTENT_FILTERS)}>
                Quitar los filtros
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : rows ? (
        <Table
          aria-label={copy.list}
          scrollAreaLabel={`Tabla de ${copy.list.toLowerCase()}`}
          data-studio-register="library"
        >
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>{copy.secondColumn}</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Última edición</TableHead>
              <TableHead aria-label="Acciones" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((item) => (
              <ContentRow
                key={item.id}
                item={item}
                kind={kind}
                basePath={basePath}
                disciplines={disciplines}
              />
            ))}
          </TableBody>
        </Table>
      ) : (
        <ul data-library-grid aria-label={copy.list}>
          {shown.map((item) => (
            <li key={item.id}>
              <ContentCard item={item} kind={kind} basePath={basePath} disciplines={disciplines} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface ContentEntryProps {
  item: ContentItem
  kind: ContentKind
  basePath: string
  disciplines: readonly CatalogDiscipline[] | undefined
}

function ContentCard({ item, kind, basePath, disciplines }: ContentEntryProps) {
  const href = contentHref(basePath, item)
  const edited = editedAt(item)
  return (
    <Card size="sm" data-library-card={kind}>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {href ? (
            <Link href={href} data-library-entry-link>
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </CardTitle>
        {/* ADR-009: an adaptation keeps its source, so the card says it is one. */}
        <CardDescription>
          {secondLine(item, disciplines)}
          {isAdaptation(item) ? ' · Adaptación' : ''}
        </CardDescription>
        <CardAction>
          <ContentMenu item={item} basePath={basePath} />
        </CardAction>
      </CardHeader>
      <CardFooter data-library-card-foot>
        <ContentStatusBadge item={item} kind={kind} />
        {edited ? <span data-library-edited>Edición: {formatDate(edited)}</span> : null}
      </CardFooter>
    </Card>
  )
}

function ContentRow({ item, kind, basePath, disciplines }: ContentEntryProps) {
  const href = contentHref(basePath, item)
  const edited = editedAt(item)
  return (
    <TableRow data-library-row={kind}>
      <TableCell>
        {href ? (
          <Link href={href} data-library-entry-link>
            {item.title}
          </Link>
        ) : (
          item.title
        )}
      </TableCell>
      <TableCell>{secondLine(item, disciplines)}</TableCell>
      <TableCell>
        <span data-library-badges>
          <ContentStatusBadge item={item} kind={kind} />
          {isAdaptation(item) ? <Badge variant="outline">Adaptación</Badge> : null}
        </span>
      </TableCell>
      <TableCell>{edited ? formatDate(edited) : null}</TableCell>
      <TableCell align="end">
        <ContentMenu item={item} basePath={basePath} />
      </TableCell>
    </TableRow>
  )
}

function secondLine(
  item: ContentItem,
  disciplines: readonly CatalogDiscipline[] | undefined,
): string {
  return item.disciplineCode
    ? disciplineName(item.disciplineCode, disciplines)
    : programShape(item.sessions)
}

const STATUS_VARIANT: Record<ContentStatus['kind'], 'success' | 'secondary' | 'outline'> = {
  published: 'success',
  draft: 'secondary',
  retired: 'outline',
  archived: 'outline',
}

function ContentStatusBadge({ item, kind }: { item: ContentItem; kind: ContentKind }) {
  const status = contentStatus(item)
  return (
    <Badge variant={STATUS_VARIANT[status.kind]} data-library-status={status.kind}>
      {contentStatusLabel(status, kind)}
    </Badge>
  )
}

/**
 * What else an item opens: each published version, read whole (`HU-STUDIO-045`).
 * With no version there is only the draft, which pressing the item already opens.
 */
function ContentMenu({ item, basePath }: { item: ContentItem; basePath: string }) {
  const router = useRouter()
  if (item.versions.length === 0) return null
  const draftHref = item.draft && !item.archived ? `${basePath}/${item.id}` : undefined
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Versiones de ${item.title}`}
            data-library-menu
          />
        }
      >
        <FoundationIcon name="more" decorative />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-library-menu-content>
        {draftHref ? (
          <>
            {/* In a group of its own, so it lines up with the versions under it. */}
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => router.push(draftHref)}>
                Abrir el borrador
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Versiones publicadas</DropdownMenuLabel>
          {item.versions.map((version) => (
            <DropdownMenuItem
              key={version.id}
              onClick={() =>
                router.push(`${basePath}/${item.id}/versions/${version.version_number}`)
              }
            >
              {versionLine(item, version)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * One version in the menu. A program version keeps the name it was published
 * under, which is shown when it is no longer the program's.
 */
function versionLine(item: ContentItem, version: ContentVersion): string {
  const renamed = version.title && version.title !== item.title ? ` · «${version.title}»` : ''
  const when = version.retired ? 'retirada' : formatDate(version.published_at)
  return `Versión ${version.version_number}${renamed} · ${when}`
}

const DAY = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

function formatDate(value: string): string {
  return DAY.format(new Date(value))
}
