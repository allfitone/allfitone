'use client'

/**
 * What the gym has made: its session templates and its programs.
 *
 * `HU-STUDIO-044`, and the first screen of a block with nine behind it, so the
 * shape here is the one they inherit. Two tabs rather than two sidebar entries:
 * the sidebar stays five entries long for what is conceptually one thing, and
 * each list keeps its own empty state — which differ, because without a
 * template there is nothing to build a program out of.
 *
 * It is built on the register the role catalogue established: a card per thing,
 * a disclosure for what is inside it, and the same four states. Nothing here
 * filters by organization; `planning.list_session_templates` and its program
 * sibling are organization-scoped and `security definer`, and a second filter
 * would be a second place for that rule to be wrong.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@allfitone/react/components/collapsible'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Spinner } from '@allfitone/react/components/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@allfitone/react/components/tabs'
import { FoundationIcon } from '@allfitone/react/icons'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { MovementLibrary } from './movement-library'
import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import {
  archivedItems,
  canManageContent,
  isAdaptation,
  livingItems,
  programItems,
  stateOf,
  templateItems,
  type ContentItem,
} from '@/lib/organization-content'
import {
  isStudioForbidden,
  organizationProgramsQueryOptions,
  organizationRolesQueryOptions,
  organizationSessionTemplatesQueryOptions,
} from '@/lib/studio-query'

const PAGE_SIZE = 50

export function OrganizationContent() {
  const { current } = useOrganizationContext()
  const rolesQuery = useQuery(organizationRolesQueryOptions(current.organization_id))
  const templatesQuery = useQuery(
    organizationSessionTemplatesQueryOptions(current.organization_id, PAGE_SIZE),
  )
  const programsQuery = useQuery(
    organizationProgramsQueryOptions(current.organization_id, PAGE_SIZE),
  )

  const allowed = canManageContent(current.roles, rolesQuery.data?.items)
  const forbidden =
    isStudioForbidden(templatesQuery.error) || isStudioForbidden(programsQuery.error)
  const pending = templatesQuery.isPending || programsQuery.isPending
  const failed = Boolean(templatesQuery.error ?? programsQuery.error) && !forbidden
  const ready = !pending && !forbidden && !failed

  const templates = templateItems(templatesQuery.data?.data ?? [])
  const programs = programItems(programsQuery.data?.data ?? [])

  function retry(): void {
    void templatesQuery.refetch()
    void programsQuery.refetch()
  }

  /*
   * The capability is read before anything else, like the invitation form does:
   * the screen says no rather than letting two reads come back `403` and
   * explaining a failure that was really a permission.
   */
  if (!rolesQuery.isPending && !allowed) {
    return (
      <section data-content-page aria-label="Contenido">
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

  return (
    <section data-content-page aria-label="Contenido">
      <WorkspacePageHeader
        description={`Las plantillas de sesión y los programas de ${current.display_name}. Un borrador es lo que alguien está escribiendo; una versión publicada ya no cambia y es la que puede asignarse.`}
        actions={
          allowed ? (
            <Link
              href={`/organizations/${current.organization_id}/content/templates/new`}
              data-slot="button"
              data-variant="default"
              className={buttonVariants()}
            >
              Nueva plantilla
            </Link>
          ) : undefined
        }
      />

      {(templatesQuery.isFetching || programsQuery.isFetching) && ready ? (
        <p data-query-refreshing role="status" aria-live="polite">
          Actualizando el contenido…
        </p>
      ) : null}

      {pending ? (
        <Card>
          <CardContent data-content-catalog-state>
            <Spinner label="Cargando el contenido" />
            <p>Cargando plantillas y programas…</p>
          </CardContent>
        </Card>
      ) : null}

      {forbidden ? (
        <Alert variant="warning">
          <AlertTitle>No puedes consultar este contenido</AlertTitle>
          <AlertDescription>
            La organización o tu membresía ya no están disponibles.
          </AlertDescription>
        </Alert>
      ) : null}

      {failed ? (
        <Alert variant="danger" live="polite">
          <AlertTitle>No pudimos cargar el contenido</AlertTitle>
          <AlertDescription>
            La conexión falló de forma temporal. Nada se muestra hasta comprobarlo de nuevo, para
            que no parezca que la organización no tiene contenido.
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" onClick={retry}>
              Reintentar
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {ready ? (
        <Tabs defaultValue="templates" data-content-tabs>
          <TabsList variant="line" aria-label="Secciones del contenido">
            <TabsTrigger value="templates">Plantillas</TabsTrigger>
            <TabsTrigger value="programs">Programas</TabsTrigger>
            <TabsTrigger value="movements">Movimientos</TabsTrigger>
          </TabsList>
          <TabsContent value="templates">
            <ContentRegister
              items={templates}
              kind="templates"
              draftHref={(item) =>
                item.draft && !item.archived
                  ? `/organizations/${current.organization_id}/content/templates/${item.id}`
                  : undefined
              }
              emptyTitle="Todavía no hay plantillas de sesión"
              emptyDescription="Una plantilla es una sesión que se puede reutilizar. Es lo primero que hace falta: un programa se compone de versiones publicadas de plantillas."
            />
          </TabsContent>
          <TabsContent value="programs">
            <ContentRegister
              items={programs}
              kind="programs"
              emptyTitle="Todavía no hay programas"
              emptyDescription="Un programa ordena en semanas y días las versiones publicadas de vuestras plantillas, y es lo que se le asigna a una persona."
            />
          </TabsContent>
          {/* Mounted only while open, so the search is not sent for a tab
              nobody looked at. */}
          <TabsContent value="movements">
            <MovementLibrary />
          </TabsContent>
        </Tabs>
      ) : null}
    </section>
  )
}

function ContentRegister({
  items,
  kind,
  emptyTitle,
  emptyDescription,
  draftHref,
}: {
  items: ContentItem[]
  kind: 'templates' | 'programs'
  emptyTitle: string
  emptyDescription: string
  /** Where an item's draft is edited, for the kinds that have an editor. */
  draftHref?: (item: ContentItem) => string | undefined
}) {
  const living = livingItems(items)
  const archived = archivedItems(items)

  if (living.length === 0 && archived.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="overview" decorative />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    /*
     * A stack, not a bare fragment. The register and the archive disclosure
     * were siblings inside the tab panel, which carries no rhythm of its own,
     * so the «Archivado» trigger sat flush against the last card. This joins
     * the same column rule the page and every section already use.
     */
    <div data-content-panel>
      <div data-content-register>
        {living.map((item) => (
          <ContentRegisterItem
            key={item.id}
            item={item}
            kind={kind}
            draftHref={draftHref?.(item)}
          />
        ))}
      </div>
      {archived.length > 0 ? (
        <Collapsible data-content-archive>
          <CollapsibleTrigger render={<Button variant="ghost" />} data-history-trigger>
            Archivado · {archived.length}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div data-content-register>
              {archived.map((item) => (
                <ContentRegisterItem
                  key={item.id}
                  item={item}
                  kind={kind}
                  draftHref={draftHref?.(item)}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}

function ContentRegisterItem({
  item,
  kind,
  draftHref,
}: {
  item: ContentItem
  kind: string
  draftHref: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const published = item.versions.length
  return (
    <Collapsible open={open} onOpenChange={setOpen} data-content-card={kind}>
      <Card data-content-register-item>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {item.title}
          </CardTitle>
          {/* Criterion 1, as the line under the name: the draft and the
              versions are said apart and never added up. */}
          <CardDescription data-content-state>{stateOf(item)}</CardDescription>
          {isAdaptation(item) ? (
            <CardAction>
              {/* ADR-009: an adaptation keeps its source, so saying so is
                  information and not decoration. Templates only — the contract
                  gives a program no source to record. */}
              <Badge variant="secondary">Adaptación</Badge>
            </CardAction>
          ) : null}
        </CardHeader>

        <CardContent data-content-card-body>
          {published === 0 ? <p>Nada publicado todavía, así que no se puede asignar.</p> : null}
          {published > 0 || draftHref ? (
            <div data-content-disclosure>
              {published > 0 ? (
                <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
                  {open ? 'Ocultar versiones' : `Ver versiones · ${published}`}
                </CollapsibleTrigger>
              ) : null}
              {draftHref ? (
                <Link
                  href={draftHref}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  data-slot="button"
                  data-variant="outline"
                  data-size="sm"
                >
                  Abrir el borrador
                </Link>
              ) : null}
            </div>
          ) : null}

          <CollapsibleContent>
            <ul data-content-version-list>
              {item.versions.map((version) => (
                <li key={version.id}>
                  <span data-content-version-number>v{version.version_number}</span>
                  {version.title ? <span>{version.title}</span> : null}
                  <span data-content-version-date>{formatDate(version.published_at)}</span>
                  {version.retired ? <Badge variant="outline">Retirada</Badge> : null}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(value))
}
