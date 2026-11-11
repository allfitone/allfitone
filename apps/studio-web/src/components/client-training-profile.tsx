'use client'

/**
 * `HU-STUDIO-051`. The training profile a client shares with the coach who
 * attends her: her discipline, goal, experience and emphasis zones as they hold
 * now, each claim with where it came from.
 *
 * Four rules, and three of them are about what this screen must not say.
 *
 * **Nothing is said about why something is missing.** The database gates each
 * column of a claim on the scope version she accepted, so a value or an origin
 * can simply not travel. That is indistinguishable from never declared — the
 * contract says so in those words — and guessing would blame her for the gym's
 * permission version.
 *
 * **Coexisting claims are all shown.** She may have declared she is starting
 * while a professional observed she is experienced. Both hold; choosing one
 * would invent a winner the server did not name.
 *
 * **No body or health datum appears here**, and not because the screen filters:
 * the function reads only attributes classified as training. There is nothing to
 * hide, which is why there is nothing here that could leak.
 *
 * **Every arrival is a read she sees.** The answer is recorded inside the same
 * transaction that produces it, so this screen asks once when somebody arrives
 * and never again on its own — see `clientTrainingProfileQueryOptions`.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  Card,
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

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { clientCardPath } from '@/lib/client-card'
import {
  appliedVersionLine,
  biologicalSexLine,
  groupClaims,
  provenanceLine,
  readableClaims,
  type ProfileAttributeGroup,
} from '@/lib/client-training-profile'
import type { ClientBiologicalSex } from '@/lib/studio-api'
import {
  clientTrainingProfileQueryOptions,
  isStudioForbidden,
  isStudioNotFound,
} from '@/lib/studio-query'

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

export function ClientTrainingProfileScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string }>()
  const query = useQuery(
    clientTrainingProfileQueryOptions(current.organization_id, params.personId),
  )
  const cardPath = clientCardPath(current.organization_id, params.personId)
  const directoryPath = `/organizations/${current.organization_id}/clients`

  if (query.isPending) return <LoadingState />
  /*
   * This operation lists `403` only as `scope-required`, so the status alone
   * says which refusal it is. Reading the problem body would be a second source
   * for something the contract already fixes.
   */
  if (isStudioForbidden(query.error)) return <ScopeRequiredState cardPath={cardPath} />
  if (isStudioNotFound(query.error)) return <UnreachableState directoryPath={directoryPath} />
  if (!query.data) return <FailureState onRetry={() => void query.refetch()} />

  const profile = query.data
  const groups = groupClaims(profile.attributes)
  const empty = groups.length === 0 && profile.biological_sex === null

  return (
    <div data-client-profile-screen>
      <WorkspacePageHeader
        description="Lo que esta persona comparte de su entrenamiento. Nada de su cuerpo ni de su salud llega aquí: son categorías con su propio permiso."
        actions={
          <>
            <Link
              href={cardPath}
              data-slot="button"
              data-variant="outline"
              data-client-profile-card-link
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Volver a su ficha
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

      <Card data-client-profile-attributes>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Lo que declaró
          </CardTitle>
          {/* Criterion 4 said once, where it explains the whole screen: the
              fields are the version's, so another gym may read other ones. */}
          <CardDescription>
            {appliedVersionLine(profile.applied_scope.version)}. Los campos que ves son los de esa
            versión, así que otro gimnasio con otra versión puede ver otros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {empty ? (
            <Empty data-client-profile-nothing>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FoundationIcon name="person" decorative />
                </EmptyMedia>
                <EmptyTitle>No hay nada de su entrenamiento que podamos mostrarte</EmptyTitle>
                {/* Both readings, and no choosing between them: the answer is
                    the same whether she declared nothing or the version this
                    gym holds does not carry those fields. */}
                <EmptyDescription>
                  Puede ser que todavía no haya declarado nada, o que la versión del permiso que
                  tienes no incluya estos datos. Desde aquí no se puede distinguir, y no vamos a
                  suponerlo.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div data-client-profile-group-list>
              {profile.biological_sex ? <BiologicalSexGroup sex={profile.biological_sex} /> : null}
              {groups.map((group) => (
                <AttributeGroup key={group.code} group={group} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Its own block because its shape is its own: a value and an origin, with no
 * date and no coexisting siblings.
 *
 * Absent, it is left out entirely. A null here could be her declining, nobody
 * asking, or the version not carrying it — three readings, and drawing an empty
 * row would pick the first.
 */
function BiologicalSexGroup({ sex }: { sex: ClientBiologicalSex }) {
  return (
    <section data-client-profile-group>
      <h3 data-client-profile-group-name>Sexo biológico</h3>
      <ul data-client-profile-claims>
        <li data-client-profile-claim>
          <strong>{biologicalSexLine(sex.value)}</strong>
          <span data-client-profile-origin>{provenanceLine(sex.provenance)}</span>
        </li>
      </ul>
    </section>
  )
}

/**
 * One attribute and every claim in force for it.
 *
 * A group whose values did not travel is still drawn, named, and says so. It is
 * the one thing on this screen that is known rather than guessed: the attribute
 * code arrived, so she does share something of this kind — what did not arrive
 * is its value.
 */
function AttributeGroup({ group }: { group: ProfileAttributeGroup }) {
  const readable = readableClaims(group)
  return (
    <section data-client-profile-group>
      <h3 data-client-profile-group-name>
        {group.name}
        {/* Why two rows follow, said before the reader wonders which one is
            right: both are, and that is the answer. */}
        {readable.length > 1 ? (
          <Badge variant="secondary" data-client-profile-coexisting>
            {readable.length} vigentes
          </Badge>
        ) : null}
      </h3>
      {readable.length === 0 ? (
        <p data-client-profile-unreadable>
          Comparte este dato, y su valor no viaja con la versión del permiso que tienes.
        </p>
      ) : (
        <ul data-client-profile-claims>
          {readable.map(({ claim, value }) => (
            <li key={claim.id} data-client-profile-claim>
              <strong>{value}</strong>
              <span data-client-profile-origin>{provenanceLine(claim.provenance)}</span>
              {claim.valid_from ? (
                <span data-client-profile-since>Desde {formatDate(claim.valid_from)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LoadingState() {
  return (
    <div data-client-profile-screen data-client-profile-loading>
      <Skeleton data-client-profile-header-placeholder />
      <Skeleton data-client-profile-panel-placeholder />
    </div>
  )
}

/**
 * Criterion 1: without the training permission in force, nothing. It is a
 * refusal and not an empty answer, so it is said as one — and it names what it
 * would take, which the coach can check on her card.
 *
 * No retry: pressing it again would refuse again, and each attempt is recorded
 * for her to read.
 */
function ScopeRequiredState({ cardPath }: { cardPath: string }) {
  return (
    <div data-client-profile-screen>
      <Alert variant="warning" live="polite" data-client-profile-scope-required>
        <AlertTitle>No te autorizó su entrenamiento</AlertTitle>
        <AlertDescription>
          Hace falta el permiso de entrenamiento vigente, y hoy no lo hay — así que no se muestra
          nada suyo, ni siquiera en blanco. El intento queda registrado y ella puede verlo. En su
          ficha está qué categorías sí te autorizó.
        </AlertDescription>
        <AlertAction>
          <Link
            href={cardPath}
            data-slot="button"
            data-variant="outline"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Ver su ficha
          </Link>
        </AlertAction>
      </Alert>
    </div>
  )
}

/**
 * Absent, or not this caller's to read — the operation answers the same for
 * both, and so does this.
 */
function UnreachableState({ directoryPath }: { directoryPath: string }) {
  return (
    <div data-client-profile-screen>
      <Empty data-client-profile-unreachable>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="person" decorative />
          </EmptyMedia>
          <EmptyTitle>No encontramos este perfil</EmptyTitle>
          <EmptyDescription>
            Un perfil solo lo abre quien atiende a la persona. Vuelve a clientes para elegir a
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

function FailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-client-profile-screen>
      <Alert variant="danger" live="polite" data-client-profile-failure>
        <AlertTitle>No pudimos cargar su perfil de entrenamiento</AlertTitle>
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
