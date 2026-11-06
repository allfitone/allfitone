'use client'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import { Badge } from '@allfitone/react/components/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { Checkbox } from '@allfitone/react/components/checkbox'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
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
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { useStudioSessionMutation } from './studio-query-provider'
import { WorkspacePageHeader } from './workspace-page-header'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type ClientInvitation,
  type ClientInvitationCreate,
  type CommandHeaders,
} from '@/lib/studio-api'
import {
  isStudioQuerySessionCancelled,
  offerableScopesQueryOptions,
  organizationClientsQueryOptions,
  organizationProgramsQueryOptions,
  organizationRolesQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'
import {
  canInviteClients,
  invitationBody,
  toggleScope,
  validateDraft,
  type InvitationDraftErrors,
} from '@/lib/client-invitations'
import {
  PROGRAM_NEEDS_THREE_YESES,
  PROGRAM_RAISES_TRAINING,
  PROGRAM_REFUSED,
  TRAINING_SCOPE,
  canProposeProgram,
  isProposing,
  noProgram,
  proposableVersions,
  proposalTimeZone,
  todayIn,
  trainingScopeOffered,
  validateProgramDraft,
  type ProgramDraft,
  type ProgramDraftErrors,
} from '@/lib/invitation-program'
import {
  QUOTA_FULL_MESSAGE,
  QUOTA_RULE_NOTE,
  guestQuotaOf,
  invitationBlockedReason,
  quotaSummary,
} from '@/lib/guest-quota'

export function ClientInvitationForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const rolesQuery = useQuery(organizationRolesQueryOptions(current.organization_id))
  const scopesQuery = useQuery(offerableScopesQueryOptions())
  // The same read as the directory, so the figure is the one the directory shows.
  const quotaQuery = useInfiniteQuery(
    organizationClientsQueryOptions(current.organization_id, 'all', 50),
  )
  const quota = guestQuotaOf(quotaQuery.data)
  const blockedReason = invitationBlockedReason(quota)
  const allowed = canInviteClients(current.roles, rolesQuery.data?.items)
  const directoryPath = `/organizations/${current.organization_id}/clients`

  const [contact, setContact] = useState('')
  const [scopeCodes, setScopeCodes] = useState<string[]>([])
  const [program, setProgram] = useState<ProgramDraft>(noProgram)
  const [programErrors, setProgramErrors] = useState<ProgramDraftErrors>({})
  const [command, setCommand] = useState(newCommand)
  const [errors, setErrors] = useState<InvitationDraftErrors>({})
  const [failure, setFailure] = useState<string>()
  const [sent, setSent] = useState<ClientInvitation>()

  const catalog = scopesQuery.data?.items ?? []
  /*
   * Only a coach holds `assign_programs`, so an owner or admin inviting never
   * reads this list. Gated on the training scope too: a program the gym cannot
   * ask the right permission for could never start, so offering one would be
   * offering a dead end.
   */
  const mayPropose = canProposeProgram(current.roles, rolesQuery.data?.items)
  const programsEnabled = mayPropose && trainingScopeOffered(catalog)
  const programsQuery = useQuery({
    ...organizationProgramsQueryOptions(current.organization_id, PROGRAM_PAGE_SIZE),
    enabled: programsEnabled,
  })
  const offered = proposableVersions(programsQuery.data?.data ?? [])
  const proposing = isProposing(program)
  const today = todayIn(proposalTimeZone())
  const createMutation = useStudioSessionMutation({
    mutationFn: (input: { body: ClientInvitationCreate; command: CommandHeaders }) =>
      studioApi.createClientInvitation(current.organization_id, input.body, input.command),
  })
  const submitting = createMutation.isPending

  /*
   * The scope and the program are linked in both directions, so no invalid
   * state is reachable and no control has to be disabled: choosing a program
   * ticks the scope it needs, and un-ticking that scope drops the program.
   * Disabling the checkbox instead would leave a dead control with its reason
   * only in the program block, further down the form.
   */
  function chooseProgram(value: string): void {
    setProgramErrors({})
    if (value === NO_PROGRAM) {
      setProgram(noProgram)
      return
    }
    setProgram((draft) => ({ ...draft, versionId: value }))
    setScopeCodes((chosen) =>
      chosen.includes(TRAINING_SCOPE) ? chosen : toggleScope(chosen, TRAINING_SCOPE, catalog),
    )
  }

  function toggleScopeRow(code: string): void {
    const next = toggleScope(scopeCodes, code, catalog)
    setScopeCodes(next)
    if (code === TRAINING_SCOPE && !next.includes(TRAINING_SCOPE)) {
      setProgram(noProgram)
      setProgramErrors({})
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || blockedReason) return
    const draft = { contact, scopeCodes, program }
    const found = validateDraft(draft)
    const foundInProgram = validateProgramDraft(program, today)
    setErrors(found)
    setProgramErrors(foundInProgram)
    if (Object.keys(found).length > 0 || Object.keys(foundInProgram).length > 0) return

    setFailure(undefined)
    try {
      const invitation = await createMutation.mutateAsync({
        body: invitationBody(draft, catalog),
        command,
      })
      await queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationClientsRoot(current.organization_id),
      })
      setSent(invitation)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        // The session was recovered mid-flight. A fresh command, so the retry
        // is a new invitation rather than a replay of one that never landed.
        setCommand(newCommand())
        return
      }
      if (caught instanceof StudioApiError && caught.code === 'guest-quota-exhausted') {
        // The figure on screen was stale: read it again so the form explains itself.
        await queryClient.invalidateQueries({
          queryKey: studioQueryKeys.organizationClientsRoot(current.organization_id),
        })
      }
      setFailure(
        caught instanceof StudioApiError ? invitationError(caught, proposing) : GENERIC_FAILURE,
      )
    }
  }

  if (!rolesQuery.isPending && !allowed) {
    // A plain section with an alert, as the directory does for the same case.
    // `SetupPanel` is two columns and would leave half the screen empty.
    return (
      <section data-client-invite-page aria-label="Invitar a una persona">
        <WorkspacePageHeader description="Invitar clientes está disponible para quienes atienden personas o administran la organización." />
        <Alert variant="warning">
          <AlertTitle>No puedes invitar clientes</AlertTitle>
          <AlertDescription>
            Tu rol en {current.display_name} no permite enviar invitaciones a clientes.
          </AlertDescription>
        </Alert>
      </section>
    )
  }

  if (sent) {
    /*
     * A `Card`, as the team invitation confirms, and not a `SetupPanel`. That
     * panel is two columns on a desktop: with nothing to put in the second one
     * it left half the screen blank beside the message.
     */
    const asked = catalog.filter((scope) => sent.scope_codes.includes(scope.scope_code))
    return (
      <Card aria-live="polite">
        <CardHeader>
          <CardDescription>
            {sent.reused ? 'Invitación reenviada' : 'Invitación enviada'}
          </CardDescription>
          <CardTitle role="heading" aria-level={2}>
            La invitación va en camino.
          </CardTitle>
          <CardAction>
            <Badge variant="warning">Pendiente</Badge>
          </CardAction>
        </CardHeader>
        <CardContent data-client-invitation-result>
          <p>
            {/* The honest summary: nothing exists on our side until they
                answer. No person, no relationship, no access to anything. */}
            Enviamos la invitación a <strong>{sent.contact_hint}</strong>. Hasta que la persona
            responda no existe ningún vínculo ni permiso, y puede aceptar unos y rechazar otros.
          </p>
          <dl data-client-invitation-summary>
            <div>
              <dt>Permisos pedidos</dt>
              <dd>{asked.map((scope) => scope.display_name).join(', ')}</dd>
            </div>
            {sent.program_proposal ? (
              <div data-client-invitation-program-sent>
                <dt>Programa propuesto</dt>
                <dd>{PROGRAM_NEEDS_THREE_YESES}</dd>
              </div>
            ) : null}
            <div>
              <dt>Vence</dt>
              <dd>
                {new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(
                  new Date(sent.expires_at),
                )}
              </dd>
            </div>
          </dl>
          <div data-client-invitation-actions>
            <Button
              onClick={() => {
                setSent(undefined)
                setContact('')
                setScopeCodes([])
                setProgram(noProgram)
                setProgramErrors({})
                setErrors({})
                setCommand(newCommand())
              }}
            >
              Invitar a otra persona
            </Button>
            <Link
              href={directoryPath}
              data-slot="button"
              data-variant="ghost"
              className={buttonVariants({ variant: 'ghost' })}
            >
              Ver el directorio
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  const loadingCatalog = scopesQuery.isPending || rolesQuery.isPending

  return (
    <SetupPanel>
      <SetupPanelIntro>
        <SetupPanelEyebrow>Clientes</SetupPanelEyebrow>
        <SetupPanelTitle as="h2">Invita a una persona.</SetupPanelTitle>
        <SetupPanelDescription>
          Elige qué quieres poder ver. La persona decidirá cada permiso por separado, y lo que
          rechace no lo veremos.
        </SetupPanelDescription>
      </SetupPanelIntro>

      <SetupPanelContent>
        <form data-studio-form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.contact)}>
              <FieldLabel htmlFor="client-invitation-email">Correo electrónico</FieldLabel>
              <Input
                id="client-invitation-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                aria-invalid={Boolean(errors.contact)}
              />
              <FieldDescription>Solo se usará para entregar esta invitación.</FieldDescription>
              {errors.contact ? <FieldError>{errors.contact}</FieldError> : null}
            </Field>
          </FieldGroup>

          <FieldSet>
            <FieldLegend>Qué quieres poder ver</FieldLegend>

            {loadingCatalog ? (
              <FieldDescription role="status">
                <Spinner label="Cargando permisos" />
                Cargando los permisos que puedes pedir…
              </FieldDescription>
            ) : scopesQuery.isError ? (
              <Alert variant="danger">
                <AlertTitle>No pudimos cargar los permisos</AlertTitle>
                <AlertDescription>
                  Sin ellos no se puede armar una invitación. Inténtalo de nuevo en un momento.
                </AlertDescription>
              </Alert>
            ) : catalog.length === 0 ? (
              /* The catalogue is published from Backoffice. Until somebody
                 curates it there is nothing to ask for, and saying so beats
                 leaving an empty box with no explanation. */
              <Alert variant="warning">
                <AlertTitle>Todavía no hay permisos publicados</AlertTitle>
                <AlertDescription>
                  No se puede invitar hasta que se publique el catálogo de permisos. Mientras tanto
                  sí puedes consultar qué abarca cada categoría de información.
                </AlertDescription>
                {/* La referencia no depende del catálogo publicado, así que es
                    lo único útil que ofrecer desde aquí mientras nadie lo cure. */}
                <AlertAction>
                  <Link
                    href={`/organizations/${current.organization_id}/clients/information-categories`}
                    data-slot="button"
                    data-variant="outline"
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    Ver las categorías de información
                  </Link>
                </AlertAction>
              </Alert>
            ) : (
              catalog.map((scope) => (
                <Field key={scope.scope_code} orientation="horizontal">
                  <Checkbox
                    id={`scope-${scope.scope_code}`}
                    checked={scopeCodes.includes(scope.scope_code)}
                    onCheckedChange={() => toggleScopeRow(scope.scope_code)}
                  />
                  {/* Name and summary on one line, not stacked: as two blocks
                      the pair read as unrelated and the gap between them was
                      the loudest thing in the row.

                      The whole description is deliberately absent. It is
                      written for the person deciding whether to hand over their
                      injuries, and seven of those paragraphs is a wall a
                      professional reads none of. The summary keeps the
                      boundary, which is the half worth keeping when there is
                      one line to spend. */}
                  <FieldLabel htmlFor={`scope-${scope.scope_code}`}>
                    {`${scope.display_name}: ${scope.summary}`}
                    {/* The raised level, shown on the row it belongs to. The
                        request and the list have to agree: a scope asked for at
                        a level the reader cannot see is the thing the
                        `read`-only rule exists to prevent. */}
                    {proposing && scope.scope_code === TRAINING_SCOPE ? (
                      <Badge variant="secondary" data-client-invitation-scope-level>
                        registrar
                      </Badge>
                    ) : null}
                  </FieldLabel>
                </Field>
              ))
            )}

            {errors.scopes ? <FieldError>{errors.scopes}</FieldError> : null}
          </FieldSet>

          {programsEnabled ? (
            <FieldSet data-client-invitation-program>
              <FieldLegend>Programa inicial (opcional)</FieldLegend>

              {programsQuery.isPending ? (
                <FieldDescription role="status">
                  <Spinner label="Cargando programas" />
                  Cargando los programas publicados…
                </FieldDescription>
              ) : programsQuery.isError ? (
                /* Not a blocker: the invitation works without a program, and
                   saying so beats a dead end the professional cannot clear. */
                <FieldDescription data-client-invitation-program-unavailable>
                  No pudimos cargar los programas. Puedes enviar la invitación sin programa y
                  proponerle uno después.
                </FieldDescription>
              ) : offered.length === 0 ? (
                <FieldDescription data-client-invitation-program-empty>
                  Todavía no hay ninguna versión de programa publicada. Solo se puede proponer una
                  publicada, así que primero hay que publicarla en el contenido de la organización.
                </FieldDescription>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="client-invitation-program">Programa</FieldLabel>
                    <Select
                      value={program.versionId || NO_PROGRAM}
                      onValueChange={(value) => chooseProgram(value ?? NO_PROGRAM)}
                      items={[
                        { value: NO_PROGRAM, label: 'Sin programa' },
                        ...offered.map((entry) => ({
                          value: entry.version_id,
                          label: programLabel(
                            entry.title,
                            entry.version_number,
                            entry.session_count,
                          ),
                        })),
                      ]}
                    >
                      <SelectTrigger id="client-invitation-program" data-studio-select-trigger>
                        <SelectValue placeholder="Sin programa" />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value={NO_PROGRAM}>Sin programa</SelectItem>
                        {offered.map((entry) => (
                          <SelectItem key={entry.version_id} value={entry.version_id}>
                            {programLabel(entry.title, entry.version_number, entry.session_count)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {proposing ? (
                    <>
                      <Field data-invalid={Boolean(programErrors.startsOn)}>
                        <FieldLabel htmlFor="client-invitation-program-start">Empieza</FieldLabel>
                        <Input
                          id="client-invitation-program-start"
                          type="date"
                          value={program.startsOn}
                          min={today}
                          aria-invalid={Boolean(programErrors.startsOn)}
                          onChange={(event) => {
                            setProgram((draft) => ({ ...draft, startsOn: event.target.value }))
                            setProgramErrors({})
                          }}
                        />
                        <FieldDescription>
                          Es tentativo: si acepta después de esa fecha, el programa empieza el día
                          que acepte.
                        </FieldDescription>
                        {programErrors.startsOn ? (
                          <FieldError>{programErrors.startsOn}</FieldError>
                        ) : null}
                      </Field>

                      {/* The sentence this block exists for: the invitation
                          stops asking only to read, and she decides it apart. */}
                      <FieldDescription data-client-invitation-program-consequence>
                        {PROGRAM_RAISES_TRAINING}
                      </FieldDescription>
                    </>
                  ) : null}
                </>
              )}
            </FieldSet>
          ) : null}

          {quota ? (
            <FieldDescription data-guest-quota-summary>{quotaSummary(quota)}</FieldDescription>
          ) : null}

          {blockedReason ? (
            <Alert variant="warning" data-guest-quota-blocked>
              <AlertTitle>No puedes invitar a nadie nuevo ahora</AlertTitle>
              <AlertDescription>
                {blockedReason} {QUOTA_RULE_NOTE}
              </AlertDescription>
            </Alert>
          ) : null}

          {failure ? <FieldError>{failure}</FieldError> : null}

          <SetupPanelActions>
            <Button
              type="submit"
              size="lg"
              disabled={submitting || catalog.length === 0 || Boolean(blockedReason)}
            >
              {submitting ? <Spinner label="Enviando la invitación" /> : null}
              {submitting ? 'Enviando…' : 'Enviar invitación'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => router.replace(directoryPath)}
            >
              Cancelar
            </Button>
          </SetupPanelActions>
        </form>
      </SetupPanelContent>
    </SetupPanel>
  )
}

const GENERIC_FAILURE =
  'La conexión falló. Conservamos el intento para que puedas reintentar sin enviar dos invitaciones.'

const NO_PROGRAM = 'none'
const PROGRAM_PAGE_SIZE = 50

function programLabel(title: string, versionNumber: number, sessionCount: number): string {
  const sessions = sessionCount === 1 ? '1 sesión' : `${sessionCount} sesiones`
  return `${title} · v${versionNumber} · ${sessions}`
}

function invitationError(error: StudioApiError, proposing: boolean): string {
  if (error.status === 403) return 'Tu rol ya no permite invitar clientes en esta organización.'
  if (error.code === 'guest-quota-exhausted') return QUOTA_FULL_MESSAGE
  if (error.status === 409) return 'Esa invitación ya se envió. Revisa el directorio.'
  /*
   * The form checks every refusal the proposal can produce, and the API drops
   * PostgreSQL's field list, so a `422` that still arrives while proposing
   * means the offered list went stale — almost always a retired version.
   */
  if (error.status === 422 && proposing) return PROGRAM_REFUSED
  if (error.status === 422) return 'Revisa el correo y los permisos marcados.'
  if (error.status === 429) {
    return 'Se enviaron demasiadas invitaciones seguidas. Inténtalo más tarde.'
  }
  if (error.status === 503) return 'Invitar clientes está temporalmente deshabilitado.'
  return GENERIC_FAILURE
}
