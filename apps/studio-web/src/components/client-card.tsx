'use client'

/**
 * `HU-STUDIO-083`. The card of a person this caller attends: an index of what
 * she lets him read, and never her data.
 *
 * Three rules worth knowing before editing.
 *
 * **What she did not allow is not here.** `OP-REL-019` leaves a category she
 * never shared, or refused, out of both lists, and this screen draws only what
 * arrives. Listing the seven categories and marking the missing ones would tell
 * a coach which ones she was asked for and turned down, which is the one thing
 * the story forbids: not empty, not locked — absent.
 *
 * **This screen reads nothing of hers.** Opening the card records no access,
 * and each operation it points to records its own. So nothing here may fetch a
 * section's content ahead of time: a prefetch would put an entry in the log she
 * reads for something the coach never opened.
 *
 * **It carries no counts, and must not grow any.** "3 sesiones" beside a
 * category would answer whether she has data of that kind, which is a different
 * question from whether she shared it.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Avatar, AvatarFallback } from '@allfitone/react/components/avatar'
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { FoundationIcon } from '@allfitone/react/icons'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Fragment } from 'react'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { formatCalendarDay } from '@/lib/calendar-day'
import {
  cardAccessLabel,
  categoryName,
  categorySummary,
  doorsBySection,
  lossReasonSentence,
  sectionsState,
  withdrawalsNewestFirst,
  type SectionDoor,
} from '@/lib/client-card'
import { clientInitials } from '@/lib/client-directory'
import type {
  AttendedClientCard,
  ClientCardSection,
  ClientCardWithdrawal,
  FormerClientCard,
  InformationCategory,
} from '@/lib/studio-api'
import {
  clientCardQueryOptions,
  informationCategoriesQueryOptions,
  isStudioForbidden,
  isStudioNotFound,
} from '@/lib/studio-query'

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

export function ClientCardScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string }>()
  const query = useQuery(clientCardQueryOptions(current.organization_id, params.personId))
  /*
   * The words each category is called, read in parallel rather than after the
   * card: it is the product's vocabulary, the same for everybody, and it holds
   * nothing of hers — so waiting for one answer before asking for the other
   * would only make the screen slower.
   */
  const catalogQuery = useQuery(informationCategoriesQueryOptions())
  const directoryPath = `/organizations/${current.organization_id}/clients`

  if (query.isPending) return <LoadingState />
  if (isStudioNotFound(query.error)) return <UnreachableState directoryPath={directoryPath} />
  if (isStudioForbidden(query.error)) return <DeniedState />
  if (!query.data) return <FailureState onRetry={() => void query.refetch()} />

  const card = query.data
  if (card.kind === 'former') return <FormerCard card={card} directoryPath={directoryPath} />

  return (
    <div data-client-card-screen>
      <WorkspacePageHeader
        description={`Lo que ${card.display_name} te autorizó a consultar. Esta pantalla no muestra ningún dato suyo: cada categoría se abre por su cuenta y queda registrada.`}
        actions={
          <>
            {/* The link is the other half of the same person: how the gym stands
                with her, who attends her, what she granted. It is a different
                screen on purpose — that one an administrator can read too. */}
            <Link
              href={`${directoryPath}/${card.relationship.id}`}
              data-slot="button"
              data-variant="outline"
              data-client-card-relationship-link
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Ver el vínculo
            </Link>
            <Link
              href={directoryPath}
              data-slot="button"
              data-variant="outline"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Volver a clientes
            </Link>
          </>
        }
      />

      {query.isFetching ? (
        <p data-query-refreshing role="status" aria-live="polite">
          Actualizando la ficha…
        </p>
      ) : null}

      <AttendancePanel card={card} />
      <SectionsPanel
        sections={card.sections}
        catalog={catalogQuery.data?.items}
        catalogPending={catalogQuery.isPending}
        onRetryCatalog={() => void catalogQuery.refetch()}
        doors={doorsBySection(card.sections, {
          organizationId: current.organization_id,
          personId: params.personId,
        })}
      />
      {card.withdrawn.length > 0 ? (
        <WithdrawnPanel withdrawn={card.withdrawn} catalog={catalogQuery.data?.items} />
      ) : null}
    </div>
  )
}

function AttendancePanel({ card }: { card: AttendedClientCard }) {
  const covering = card.attendance.role === 'substitute'
  return (
    <Card data-client-card-attendance>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Cómo la atiendes
        </CardTitle>
        <CardDescription>
          Estar a cargo no es tener permiso: lo que puedes consultar lo decide ella, no tu
          asignación.
        </CardDescription>
        <CardAction>
          <Badge variant={covering ? 'warning' : 'success'}>
            {covering ? 'Cubriendo' : 'A cargo'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {/* The person on her own full-width line, the way the relationship
            screen carries a name: inside the label/value grid she shared the row
            with a label and broke mid-word on a phone. */}
        <div data-client-identity data-client-card-subject>
          <Avatar decorative>
            <AvatarFallback>{clientInitials(card.display_name)}</AvatarFallback>
          </Avatar>
          <strong>{card.display_name}</strong>
        </div>
        <dl data-client-card-facts>
          <dt>Vínculo desde</dt>
          <dd>{formatDate(card.relationship.started_at)}</dd>

          {/* Only a cover has an end, and it is a day in the gym's calendar.
              Said in advance because losing a client without warning is what
              makes the product look broken. */}
          {covering && card.attendance.ends_on ? (
            <>
              <dt>Cubres hasta</dt>
              <dd>{formatCalendarDay(card.attendance.ends_on)}</dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  )
}

/**
 * The categories she shares now, in the order the operation answers them.
 *
 * No total, no "3 de 7", no list of what is missing. The panel says what it
 * holds and stops, because every way of counting it answers a question about
 * her that she did not agree to answer.
 */
function SectionsPanel({
  sections,
  catalog,
  catalogPending,
  onRetryCatalog,
  doors,
}: {
  sections: readonly ClientCardSection[]
  catalog: readonly InformationCategory[] | undefined
  catalogPending: boolean
  onRetryCatalog: () => void
  doors: ReadonlyMap<string, readonly SectionDoor[]>
}) {
  const state = sectionsState(sections, catalog, catalogPending)
  return (
    <Card data-client-card-sections>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Lo que te autorizó
        </CardTitle>
        <CardDescription>
          Lo que no aparece aquí no te lo autorizó, y nada en esta pantalla dice si tiene datos de
          ese tipo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === 'none' ? (
          <Empty data-client-card-no-sections>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FoundationIcon name="permissions" decorative />
              </EmptyMedia>
              <EmptyTitle>Todavía no te autorizó ninguna categoría</EmptyTitle>
              <EmptyDescription>
                Te asignaron a ella, y eso no le pide nada: hasta que comparta una categoría no hay
                nada suyo que puedas consultar.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : state.kind === 'naming' ? (
          <Skeleton data-client-card-panel-placeholder />
        ) : state.kind === 'ready' ? (
          <ul data-client-card-section-list>
            {sections.map((section) => (
              <li key={section.scope_code}>
                <SectionEntry
                  section={section}
                  catalog={state.catalog}
                  doors={doors.get(section.scope_code) ?? []}
                />
              </li>
            ))}
          </ul>
        ) : (
          /* An unnamed list of permissions is worse than none: the reader would
             be deciding about codes. The categories are still there, so this is
             a retry and not a denial. */
          <Alert variant="warning" live="polite" data-client-card-catalog-failure>
            <AlertTitle>No pudimos cargar los nombres de las categorías</AlertTitle>
            <AlertDescription>
              Lo que te autorizó no cambió. Vuelve a intentarlo para verlo con sus nombres.
            </AlertDescription>
            <AlertAction>
              <Button size="sm" variant="outline" onClick={onRetryCatalog}>
                Reintentar
              </Button>
            </AlertAction>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * One category, with a way in for each read this app can serve. A category
 * whose reads have no screen yet carries no door rather than one that leads
 * nowhere, and a destination two categories share is offered once — see
 * `doorsBySection`.
 *
 * The permission's version is left out. It explains why two gyms see different
 * fields of the same person, which is a thing to say where those fields are
 * shown — not beside a name a coach cannot act on.
 */
function SectionEntry({
  section,
  catalog,
  doors,
}: {
  section: ClientCardSection
  catalog: readonly InformationCategory[]
  doors: readonly SectionDoor[]
}) {
  const summary = categorySummary(section.scope_code, catalog)
  return (
    <Card data-client-card-section>
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          {categoryName(section.scope_code, catalog)}
        </CardTitle>
        {summary ? <CardDescription>{summary}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <dl data-client-card-facts>
          <dt>Alcance</dt>
          <dd>{cardAccessLabel(section.access_level)}</dd>

          <dt>Desde</dt>
          <dd>{formatDate(section.granted_at)}</dd>
        </dl>
        {/* Under the facts, inside the content, and deliberately not in a
            `CardFooter`. A phone wants them here, and the header's action slot
            would have meant editing a Design System card's own grid — but the
            footer is not the way either: the library marks a card that
            `:has([data-slot=card-footer])` as supplying its own bottom padding,
            and that selector matches a descendant, so a footer in here stripped
            the padding off the panel that contains this card. Avoided here
            rather than patched in this app's CSS; the selector needs a child
            combinator, which is a fix for the library. */}
        {doors.length > 0 ? (
          <div data-client-card-doors>
            {doors.map((door) => (
              <Link
                key={door.read}
                href={door.href}
                data-slot="button"
                data-variant="outline"
                data-client-card-door={door.read}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {door.label}
              </Link>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * What she took back. Said because a coach who used to see something and no
 * longer does needs to know why, rather than suspecting the product.
 *
 * It says when, never why: the decision is hers and the operation does not
 * carry a reason.
 */
function WithdrawnPanel({
  withdrawn,
  catalog,
}: {
  withdrawn: readonly ClientCardWithdrawal[]
  catalog: readonly InformationCategory[] | undefined
}) {
  return (
    <Card data-client-card-withdrawn>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Lo que retiró
        </CardTitle>
        <CardDescription>
          Categorías que te había autorizado y ya no. Que una no esté disponible no dice si tiene
          datos de ese tipo, ni por qué decidió retirarla.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl data-client-card-facts>
          {withdrawalsNewestFirst(withdrawn).map((entry) => (
            <Fragment key={entry.scope_code}>
              <dt>{categoryName(entry.scope_code, catalog)}</dt>
              <dd>Retirada el {formatDate(entry.withdrawn_at)}</dd>
            </Fragment>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

/**
 * `HU-STUDIO-084`, as far as this operation answers it: for thirty days after a
 * coach loses a client, the card says why instead of disappearing.
 *
 * It carries no name and no reason beyond the three the contract lists, and
 * nothing here invents either. The full experience of that story is its own
 * ticket.
 */
function FormerCard({ card, directoryPath }: { card: FormerClientCard; directoryPath: string }) {
  return (
    <div data-client-card-screen>
      <WorkspacePageHeader description="Por qué dejaste de atender a esta persona." />
      <Card data-client-card-former>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Ya no la atiendes
          </CardTitle>
          <CardDescription>
            No es un fallo de la aplicación: algo cambió y por eso su ficha ya no está.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div data-client-card-loss>
            <p data-client-card-loss-reason>{lossReasonSentence(card.reason)}</p>
            <dl data-client-card-facts>
              <dt>Desde</dt>
              <dd>{formatDate(card.lost_at)}</dd>
            </dl>
            <Link
              href={directoryPath}
              data-slot="button"
              data-variant="outline"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Volver a clientes
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LoadingState() {
  return (
    <div data-client-card-screen data-client-card-loading>
      <Skeleton data-client-card-header-placeholder />
      <Skeleton data-client-card-panel-placeholder />
      <Skeleton data-client-card-panel-placeholder />
    </div>
  )
}

/**
 * Absent, or not this caller's to read. The copy commits to neither, because
 * the operation does not: telling somebody that the person exists but is not
 * theirs would reveal that the gym has her as a client.
 */
function UnreachableState({ directoryPath }: { directoryPath: string }) {
  return (
    <div data-client-card-screen>
      <Empty data-client-card-unreachable>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="person" decorative />
          </EmptyMedia>
          <EmptyTitle>No encontramos esta ficha</EmptyTitle>
          <EmptyDescription>
            Una ficha solo la abre quien atiende a la persona. Vuelve a clientes para elegir a
            alguien.
          </EmptyDescription>
        </EmptyHeader>
        <Link
          href={directoryPath}
          data-slot="button"
          data-variant="outline"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Volver a clientes
        </Link>
      </Empty>
    </div>
  )
}

// A denial, not an outage: a retry here would offer something that cannot
// succeed.
function DeniedState() {
  return (
    <div data-client-card-screen>
      <Alert variant="danger" live="polite" data-client-card-denied>
        <AlertTitle>No puedes consultar fichas de clientes</AlertTitle>
        <AlertDescription>
          Tu membresía en esta organización ya no lo permite. Puedes seguir trabajando en las demás
          secciones.
        </AlertDescription>
      </Alert>
    </div>
  )
}

function FailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-client-card-screen>
      <Alert variant="danger" live="polite" data-client-card-failure>
        <AlertTitle>No pudimos cargar la ficha</AlertTitle>
        <AlertDescription>
          La conexión falló de forma temporal. Lo que te autorizó sigue igual.
        </AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    </div>
  )
}

function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value))
}
