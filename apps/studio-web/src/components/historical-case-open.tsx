'use client'

/**
 * Opening a historical access case: `HU-STUDIO-061`.
 *
 * Six answers, each one a criterion: which ended relationship, who the case
 * authorizes, why, the reference it answers to, the justification and for how
 * long. The rules and their wording are in `@/lib/historical-access`; this file
 * only lays them out and sends the command.
 *
 * **The ended relationship comes from the directory** (`status=terminated`), which
 * owners and administrators already read and which carries no fitness data. The
 * case is what opens her history, not this picker.
 *
 * **Signing in again keeps the form.** The command needs a sign-in less than ten
 * minutes old, and the sign-in comes back to the Studio entry, not here. So the
 * draft is kept in this tab before leaving, and the entry brings the person back
 * (`@/lib/historical-return`).
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { RadioGroup, RadioGroupItem } from '@allfitone/react/components/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import {
  SetupPanel,
  SetupPanelActions,
  SetupPanelContent,
  SetupPanelDescription,
  SetupPanelEyebrow,
  SetupPanelIntro,
  SetupPanelTitle,
} from '@allfitone/react/components/setup-shell'
import { Spinner } from '@allfitone/react/components/spinner'
import { Textarea } from '@allfitone/react/components/textarea'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { useStudioSessionMutation } from './studio-query-provider'
import { SEARCH_RAW_LIMIT, searchTermToSend } from '@/lib/client-directory'
import {
  HISTORICAL_DURATIONS,
  HISTORICAL_PURPOSES,
  JUSTIFICATION_MAX,
  REFERENCE_MAX,
  authorizationChoices,
  canManageHistoricalAccess,
  caseDraftProblems,
  durationLabel,
  emptyCaseDraft,
  endedOnLine,
  formerHolder,
  isHistoricalPurpose,
  openCaseFailure,
  openCaseRequest,
  type CaseDraft,
  type CaseDraftRelationship,
  type OpenCaseFailure,
} from '@/lib/historical-access'
import {
  clearCaseDraft,
  readCaseDraft,
  reauthenticationUrl,
  rememberReturn,
  saveCaseDraft,
} from '@/lib/historical-return'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type HistoricalAccessCaseCreate,
} from '@/lib/studio-api'
import {
  isStudioQuerySessionCancelled,
  organizationClientsQueryOptions,
  organizationRolesQueryOptions,
  relationshipHistoryQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PICKER_PAGE = 10
const SEARCH_SETTLE_MS = 300
/* The holder's end sits beside the relationship's own, at the top of the history. */
const HISTORY_PAGE = 25

export function HistoricalCaseOpenForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const casesPath = `/organizations/${organizationId}/historical-access-cases`
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  // Rendered only in the browser, inside the organization's workspace.
  const [kept] = useState(() => readCaseDraft(organizationId, Date.now()))
  const [draft, setDraft] = useState<CaseDraft>(() => kept ?? emptyCaseDraft())
  const [command, setCommand] = useState(newCommand)
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState<OpenCaseFailure | null>(null)
  const [searchBox, setSearchBox] = useState('')
  const search = searchTermToSend(useDebouncedValue(searchBox, SEARCH_SETTLE_MS))
  const allowed = canManageHistoricalAccess(current.roles, rolesQuery.data?.items)

  const pickerQuery = useInfiniteQuery({
    ...organizationClientsQueryOptions(organizationId, 'terminated', PICKER_PAGE, search),
    enabled: allowed && draft.relationship === null,
  })
  const historyQuery = useInfiniteQuery({
    ...relationshipHistoryQueryOptions(organizationId, draft.relationship?.id ?? '', HISTORY_PAGE),
    enabled: allowed && draft.relationship !== null,
  })

  const open = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: HistoricalAccessCaseCreate; command: CommandHeaders },
      signal,
    ) => studioApi.openHistoricalAccessCase(organizationId, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.historicalAccessCasesRoot(organizationId),
      })
    },
  })

  if (rolesQuery.isPending) return null

  if (!allowed) {
    return (
      <section data-historical-case-refusal>
        <Alert variant="warning" live="polite">
          <AlertTitle>Tu rol no abre casos</AlertTitle>
          <AlertDescription>
            Abrir un caso de acceso al historial corresponde a propietario y administración de{' '}
            {current.display_name}.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.replace(casesPath)}>
          Volver a los casos
        </Button>
      </section>
    )
  }

  const holder =
    draft.relationship && historyQuery.data
      ? formerHolder(
          historyQuery.data.pages.flatMap((page) => page.data),
          draft.relationship.endedAt,
        )
      : null
  const choices = authorizationChoices(current.membership_id, holder)
  const holderPending = draft.relationship !== null && historyQuery.isPending
  // A choice the screen no longer offers is no choice: the coach may have been read away.
  const authorized = choices.some((choice) => choice.value === draft.authorized)
    ? draft.authorized
    : null
  const effective: CaseDraft = { ...draft, authorized }
  const problems = submitted ? caseDraftProblems(effective) : {}
  const ended = (pickerQuery.data?.pages ?? [])
    .flatMap((page) => page.data)
    .flatMap((entry) =>
      entry.kind === 'relationship' && entry.ended_at
        ? [{ id: entry.relationship_id, name: entry.display_name, endedAt: entry.ended_at }]
        : [],
    )

  function change(next: Partial<CaseDraft>) {
    setDraft((previous) => ({ ...previous, ...next }))
    // A different case is a different command: the old key would replay the first one.
    setCommand(newCommand())
    setFailure(null)
  }

  function chooseRelationship(relationship: CaseDraftRelationship | null) {
    // Who may be authorized depends on who held this relationship, so it is asked again.
    change({ relationship, authorized: null })
  }

  function signInAgain() {
    const now = Date.now()
    saveCaseDraft(organizationId, draft, now)
    rememberReturn(`${casesPath}/new`, now)
    window.location.assign(reauthenticationUrl(studioApi.apiUrl))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    const body = openCaseRequest(effective)
    if (open.isPending || holderPending || !body) return
    setFailure(null)
    try {
      await open.mutateAsync({ body, command })
      clearCaseDraft()
      router.replace(casesPath)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return
      }
      setFailure(
        caught instanceof StudioApiError
          ? openCaseFailure(caught.status, caught.code)
          : openCaseFailure(0, 'network'),
      )
    }
  }

  return (
    <SetupPanel>
      <SetupPanelIntro>
        <SetupPanelEyebrow>Casos de historial</SetupPanelEyebrow>
        <SetupPanelTitle as="h2">Abre un caso.</SetupPanelTitle>
        {/* Criterion 1, before anything is asked. */}
        <SetupPanelDescription>
          Un caso deja consultar, durante unas horas, lo que una persona nos había compartido hasta
          el día en que terminó la relación. Abrirlo no te deja leer nada por sí solo: lee solo a
          quien autoriza, y cada consulta queda registrada.
        </SetupPanelDescription>
      </SetupPanelIntro>

      <SetupPanelContent>
        {kept ? (
          <Alert variant="info" live="polite" data-historical-case-restored>
            <AlertTitle>Recuperamos lo que habías escrito</AlertTitle>
            <AlertDescription>
              Lo guardamos en este navegador mientras volvías a iniciar sesión. Revísalo y abre el
              caso.
            </AlertDescription>
          </Alert>
        ) : null}

        <form data-studio-form onSubmit={submit} noValidate>
          <FieldGroup>
            <FieldSet data-invalid={Boolean(problems.relationship)}>
              <FieldLegend>Relación terminada</FieldLegend>
              {draft.relationship ? (
                <div data-historical-case-chosen>
                  <span data-historical-case-relationship>
                    <strong>{draft.relationship.name}</strong>
                    <small>{endedOnLine(draft.relationship.endedAt)}</small>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => chooseRelationship(null)}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : (
                <RelationshipPicker
                  searchBox={searchBox}
                  onSearch={setSearchBox}
                  searching={search !== undefined}
                  pending={pickerQuery.isPending}
                  failed={pickerQuery.isError}
                  onRetry={() => void pickerQuery.refetch()}
                  ended={ended}
                  hasMore={pickerQuery.hasNextPage}
                  loadingMore={pickerQuery.isFetchingNextPage}
                  onMore={() => void pickerQuery.fetchNextPage()}
                  onChoose={chooseRelationship}
                />
              )}
              <FieldDescription>
                Solo relaciones que ya terminaron. Mientras una relación sigue vigente, su historial
                se consulta desde la ficha de la persona, no con un caso.
              </FieldDescription>
              {problems.relationship ? <FieldError>{problems.relationship}</FieldError> : null}
            </FieldSet>

            <FieldSet data-invalid={Boolean(problems.authorized)}>
              <FieldLegend>A quién autoriza</FieldLegend>
              {draft.relationship === null ? (
                <FieldDescription>Primero elige la relación.</FieldDescription>
              ) : holderPending ? (
                <Spinner label="Buscando quién la atendía" />
              ) : (
                <RadioGroup
                  value={authorized ?? ''}
                  aria-label="A quién autoriza"
                  onValueChange={(value) => {
                    if (typeof value === 'string') change({ authorized: value })
                  }}
                >
                  {choices.map((choice) => (
                    <Field key={choice.value} orientation="horizontal">
                      <RadioGroupItem
                        id={`historical-authorized-${choice.value}`}
                        value={choice.value}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`historical-authorized-${choice.value}`}>
                          {choice.label}
                        </FieldLabel>
                        <FieldDescription>{choice.hint}</FieldDescription>
                      </FieldContent>
                    </Field>
                  ))}
                </RadioGroup>
              )}
              {historyQuery.isError ? (
                <Alert variant="warning" live="polite" data-historical-case-holder-unknown>
                  <AlertTitle>No pudimos saber quién la atendía</AlertTitle>
                  <AlertDescription>
                    Puedes autorizarte a ti, o intentar de nuevo para ver a su coach.
                  </AlertDescription>
                  <AlertAction>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void historyQuery.refetch()}
                    >
                      Reintentar
                    </Button>
                  </AlertAction>
                </Alert>
              ) : null}
              {/* Criterion 5: staff never, and only these two. */}
              <FieldDescription>
                Solo puede ser quien abre el caso o el coach que la atendía cuando terminó la
                relación, mientras siga como propietario, administración o coach. Staff nunca.
              </FieldDescription>
              {problems.authorized ? <FieldError>{problems.authorized}</FieldError> : null}
            </FieldSet>

            {/* Criteria 2 and 3: the five valid purposes, and nothing else on screen. */}
            <FieldSet data-invalid={Boolean(problems.purpose)}>
              <FieldLegend>Propósito</FieldLegend>
              <RadioGroup
                value={draft.purpose ?? ''}
                aria-label="Propósito"
                onValueChange={(value) => {
                  if (isHistoricalPurpose(value)) change({ purpose: value })
                }}
              >
                {HISTORICAL_PURPOSES.map((purpose) => (
                  <Field key={purpose.value} orientation="horizontal">
                    <RadioGroupItem
                      id={`historical-purpose-${purpose.value}`}
                      value={purpose.value}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={`historical-purpose-${purpose.value}`}>
                        {purpose.label}
                      </FieldLabel>
                      <FieldDescription>{purpose.hint}</FieldDescription>
                    </FieldContent>
                  </Field>
                ))}
              </RadioGroup>
              {problems.purpose ? <FieldError>{problems.purpose}</FieldError> : null}
            </FieldSet>

            <Field data-invalid={Boolean(problems.reference)}>
              <FieldLabel htmlFor="historical-case-reference">Referencia del caso</FieldLabel>
              <Input
                id="historical-case-reference"
                name="case_reference"
                maxLength={REFERENCE_MAX}
                value={draft.reference}
                aria-invalid={Boolean(problems.reference)}
                onChange={(event) => change({ reference: event.target.value })}
              />
              <FieldDescription>
                El radicado, el ticket o el expediente al que responde, por ejemplo RAD-2026-114.
              </FieldDescription>
              {problems.reference ? <FieldError>{problems.reference}</FieldError> : null}
            </Field>

            <Field data-invalid={Boolean(problems.justification)}>
              <FieldLabel htmlFor="historical-case-justification">Justificación</FieldLabel>
              <Textarea
                id="historical-case-justification"
                name="justification"
                maxLength={JUSTIFICATION_MAX}
                value={draft.justification}
                aria-invalid={Boolean(problems.justification)}
                onChange={(event) => change({ justification: event.target.value })}
              />
              <FieldDescription>
                Por qué hace falta consultar su historial. Se queda en el caso: no aparece en
                ninguna lista de actividad.
              </FieldDescription>
              {problems.justification ? <FieldError>{problems.justification}</FieldError> : null}
            </Field>

            {/* Criterion 4: chosen, never defaulted. */}
            <Field data-invalid={Boolean(problems.hours)}>
              <FieldLabel htmlFor="historical-case-hours">Duración</FieldLabel>
              <Select
                value={draft.hours === null ? null : String(draft.hours)}
                onValueChange={(value) => {
                  const hours = Number(value)
                  if (HISTORICAL_DURATIONS.includes(hours)) change({ hours })
                }}
                items={HISTORICAL_DURATIONS.map((hours) => ({
                  value: String(hours),
                  label: durationLabel(hours),
                }))}
              >
                <SelectTrigger
                  id="historical-case-hours"
                  data-studio-select-trigger
                  aria-invalid={Boolean(problems.hours)}
                >
                  <SelectValue placeholder="Elige cuántas horas" />
                </SelectTrigger>
                <SelectContent align="start">
                  {HISTORICAL_DURATIONS.map((hours) => (
                    <SelectItem key={hours} value={String(hours)}>
                      {durationLabel(hours)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                De una a veinticuatro horas. Al cumplirse, el caso deja de servir solo.
              </FieldDescription>
              {problems.hours ? <FieldError>{problems.hours}</FieldError> : null}
            </Field>
          </FieldGroup>

          {failure?.kind === 'reauthenticate' ? (
            <Alert variant="warning" live="assertive" data-historical-case-reauthenticate>
              <AlertTitle>Vuelve a iniciar sesión para abrir el caso</AlertTitle>
              <AlertDescription>
                Abrir un caso exige haber iniciado sesión hace menos de diez minutos. Lo que
                escribiste se queda guardado en este navegador y lo recuperas al volver.
              </AlertDescription>
              <AlertAction>
                <Button type="button" size="sm" onClick={signInAgain}>
                  Iniciar sesión de nuevo
                </Button>
              </AlertAction>
            </Alert>
          ) : failure ? (
            <Alert variant="danger" live="assertive" data-historical-case-error>
              <AlertTitle>No se abrió el caso</AlertTitle>
              <AlertDescription>{failure.text}</AlertDescription>
            </Alert>
          ) : null}

          <SetupPanelActions>
            <Button type="submit" size="lg" disabled={open.isPending || holderPending}>
              {open.isPending ? <Spinner label="Abriendo el caso" /> : null}
              {open.isPending ? 'Abriendo…' : 'Abrir el caso'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={open.isPending}
              onClick={() => {
                clearCaseDraft()
                router.replace(casesPath)
              }}
            >
              Cancelar
            </Button>
          </SetupPanelActions>
        </form>
      </SetupPanelContent>
    </SetupPanel>
  )
}

function RelationshipPicker({
  searchBox,
  onSearch,
  searching,
  pending,
  failed,
  onRetry,
  ended,
  hasMore,
  loadingMore,
  onMore,
  onChoose,
}: {
  searchBox: string
  onSearch: (value: string) => void
  searching: boolean
  pending: boolean
  failed: boolean
  onRetry: () => void
  ended: CaseDraftRelationship[]
  hasMore: boolean
  loadingMore: boolean
  onMore: () => void
  onChoose: (relationship: CaseDraftRelationship) => void
}) {
  return (
    <div data-historical-case-picker>
      <Field>
        <FieldLabel htmlFor="historical-case-search">Buscar por nombre</FieldLabel>
        <Input
          id="historical-case-search"
          type="search"
          maxLength={SEARCH_RAW_LIMIT}
          value={searchBox}
          onChange={(event) => onSearch(event.target.value)}
        />
      </Field>
      {pending ? (
        <Spinner label="Buscando relaciones terminadas" />
      ) : failed ? (
        <Alert variant="danger" live="polite" data-historical-case-picker-failure>
          <AlertTitle>No pudimos cargar las relaciones terminadas</AlertTitle>
          <AlertDescription>La conexión falló de forma temporal.</AlertDescription>
          <AlertAction>
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Reintentar
            </Button>
          </AlertAction>
        </Alert>
      ) : ended.length === 0 ? (
        <p data-historical-case-picker-empty>
          {searching
            ? 'Ninguna relación terminada coincide con ese nombre.'
            : 'Esta organización no tiene relaciones terminadas.'}
        </p>
      ) : (
        <ul data-historical-case-picker-results>
          {ended.map((relationship) => (
            <li key={relationship.id}>
              <span data-historical-case-relationship>
                <strong>{relationship.name}</strong>
                <small>{endedOnLine(relationship.endedAt)}</small>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`Elegir a ${relationship.name}`}
                onClick={() => onChoose(relationship)}
              >
                Elegir
              </Button>
            </li>
          ))}
        </ul>
      )}
      {hasMore ? (
        <Button type="button" size="sm" variant="ghost" disabled={loadingMore} onClick={onMore}>
          {loadingMore ? 'Cargando…' : 'Ver más'}
        </Button>
      ) : null}
    </div>
  )
}
