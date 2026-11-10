'use client'

/**
 * `HU-BO-029` — who on the team reaches the data — and `HU-BO-028` — granting and
 * withdrawing that reach. They are one screen because they are one question: an
 * operator cannot administer access sensibly without seeing it first.
 *
 * The administration controls are always offered, never hidden behind what the
 * inventory says the operator holds. That is deliberate. The inventory is
 * evidence, and using it to decide what to render would turn it into an
 * authorization cache — exactly what the story forbids. Every action is
 * attempted and the API answers from its own transaction.
 *
 * ADR-046: the admin role brings every duty and they last as long as it does, so
 * there is no duty form. A duty held through the role offers no action of its own.
 *
 * HU-BO-029 c1: every assignment says who holds it and who granted it, by name, with
 * the short identifier beside it for a case. The person who receives the role is found
 * with the same search as /people, so nobody types an identifier; that search is
 * recorded on everyone it answers, as it is there.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@allfitone/react/components/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import { ScreenFailure, ScreenLoading, ScreenRefusal } from './screen-state'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
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
  TableState,
} from '@allfitone/react/components/table'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type PlatformDutyAssignment,
  type PlatformDutyCode,
  type PlatformDutyFilters,
  type PlatformRoleAssignment,
  type SupportPeopleSearch,
} from '@/lib/backoffice-api'
import {
  actorModeLabel,
  canRecertify,
  DUTY_STATUS_FILTERS,
  PLATFORM_DUTY_CODES,
  dutyLabel,
  dutyStatusLabel,
  dutyStatusTone,
  dutyWindowLabel,
  formatInstant,
  isDutyClosed,
  isHeldThroughRole,
  isValidPersonId,
  personName,
  platformAccessMessage,
  roleStatusLabel,
  roleStatusTone,
  shortIdentifier,
  type PlatformDutyStatus,
} from '@/lib/platform-access'
import { isSearchable, supportMetadataMessage } from '@/lib/support-metadata'

type PersonMatch = SupportPeopleSearch['items'][number]

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

interface Inventory {
  roles: PlatformRoleAssignment[]
  roleCursor: string | null
  duties: PlatformDutyAssignment[]
  dutyCursor: string | null
}

const EMPTY: Inventory = { roles: [], roleCursor: null, duties: [], dutyCursor: null }

/** HU-BO-029 c2: what the duty list is narrowed to; empty means every value. */
interface DutyFilter {
  status: PlatformDutyStatus | ''
  dutyCode: PlatformDutyCode | ''
}

// A select item needs a value of its own; this one stands for "no filter".
const ALL = 'all'

function dutyQuery(filter: DutyFilter): PlatformDutyFilters {
  return {
    ...(filter.status === '' ? {} : { status: filter.status }),
    ...(filter.dutyCode === '' ? {} : { dutyCode: filter.dutyCode }),
  }
}

export function PlatformAccess() {
  const [state, setState] = useState<LoadState>('loading')
  const [inventory, setInventory] = useState<Inventory>(EMPTY)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [appending, setAppending] = useState<'roles' | 'duties' | null>(null)
  const [dutyFilter, setDutyFilter] = useState<DutyFilter>({ status: '', dutyCode: '' })

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [roles, duties] = await Promise.all([
          backofficeApi.platformRoles(undefined, signal),
          backofficeApi.platformDuties(dutyQuery(dutyFilter), signal),
        ])
        setInventory({
          roles: roles.data,
          roleCursor: roles.page.next_cursor,
          duties: duties.data,
          dutyCursor: duties.page.next_cursor,
        })
        setState('ready')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (error instanceof BackofficeApiError && error.status === 401) {
          window.location.assign('/')
          return
        }
        setState(
          error instanceof BackofficeApiError && error.status === 403 ? 'forbidden' : 'error',
        )
      }
    },
    [dutyFilter],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  /**
   * The inventory answers a page at a time. Showing only the first one would
   * tell the founder that it is the whole team, which is the opposite of what
   * this screen is for, so the rest is reachable and the button says so.
   */
  async function loadMore(which: 'roles' | 'duties') {
    const cursor = which === 'roles' ? inventory.roleCursor : inventory.dutyCursor
    if (!cursor) return
    setAppending(which)
    setNotice(null)
    try {
      if (which === 'roles') {
        const page = await backofficeApi.platformRoles(cursor)
        setInventory((current) => ({
          ...current,
          roles: [...current.roles, ...page.data],
          roleCursor: page.page.next_cursor,
        }))
      } else {
        const page = await backofficeApi.platformDuties({ ...dutyQuery(dutyFilter), cursor })
        setInventory((current) => ({
          ...current,
          duties: [...current.duties, ...page.data],
          dutyCursor: page.page.next_cursor,
        }))
      }
    } catch (error) {
      setNotice({ tone: 'danger', message: failureMessage(error) })
    } finally {
      setAppending(null)
    }
  }

  const run = useCallback(
    async (operation: () => Promise<unknown>, success: string) => {
      setBusy(true)
      setNotice(null)
      try {
        await operation()
        await load()
        setNotice({ tone: 'success', message: success })
      } catch (error) {
        setNotice({ tone: 'danger', message: failureMessage(error) })
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  if (state === 'loading') return <ScreenLoading label="Cargando el inventario de acceso" />

  if (state === 'forbidden') {
    return (
      <ScreenRefusal
        title="No puedes ver este inventario"
        duties={['manage_platform_access', 'audit_platform_access']}
      >
        Consultarlo exige el rol de administrador vigente, con AAL2. Si lo tenías, puede haber sido
        retirado.
      </ScreenRefusal>
    )
  }

  if (state === 'error') {
    return (
      <ScreenFailure
        refused={false}
        duties={[]}
        title="No se pudo cargar el inventario"
        message={'El servicio no respondió.'}
        onRetry={() => void load()}
      />
    )
  }

  return (
    <div data-platform-access>
      {notice ? (
        <Alert live="polite" variant={notice.tone === 'success' ? 'success' : 'danger'}>
          <AlertTitle>{notice.tone === 'success' ? 'Hecho' : 'No se aplicó'}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      <BaseRoleSection
        assignments={inventory.roles}
        busy={busy}
        hasMore={inventory.roleCursor !== null}
        appending={appending === 'roles'}
        onLoadMore={() => void loadMore('roles')}
        onGrant={(personId) =>
          run(
            () => backofficeApi.grantPlatformRole(personId, newBackofficeCommand()),
            'Rol base otorgado.',
          )
        }
        onRevoke={(assignmentId) =>
          run(
            () => backofficeApi.revokePlatformRole(assignmentId, newBackofficeCommand()),
            'Rol base retirado. Se cerraron sus deberes y su sesión.',
          )
        }
      />

      <DutySection
        assignments={inventory.duties}
        filter={dutyFilter}
        onFilter={setDutyFilter}
        busy={busy}
        hasMore={inventory.dutyCursor !== null}
        appending={appending === 'duties'}
        onLoadMore={() => void loadMore('duties')}
        onSuspend={(assignmentId) =>
          run(
            () => backofficeApi.suspendPlatformDuty(assignmentId, newBackofficeCommand()),
            'Deber suspendido. Deja de autorizar desde la próxima transacción.',
          )
        }
        onRevoke={(assignmentId) =>
          run(
            () => backofficeApi.revokePlatformDuty(assignmentId, newBackofficeCommand()),
            'Deber revocado.',
          )
        }
        onRecertify={(assignmentId) =>
          run(
            () => backofficeApi.recertifyPlatformDuty(assignmentId, newBackofficeCommand()),
            'Deber recertificado: queda registrado quién lo confirmó y cuándo. No alarga su vigencia.',
          )
        }
      />
    </div>
  )
}

function BaseRoleSection({
  assignments,
  busy,
  hasMore,
  appending,
  onLoadMore,
  onGrant,
  onRevoke,
}: {
  assignments: PlatformRoleAssignment[]
  busy: boolean
  hasMore: boolean
  appending: boolean
  onLoadMore: () => void
  onGrant: (personId: string) => void
  onRevoke: (assignmentId: string) => Promise<void>
}) {
  const [term, setTerm] = useState('')
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<SupportPeopleSearch | null>(null)
  const [chosen, setChosen] = useState<PersonMatch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  async function search(event: FormEvent) {
    event.preventDefault()
    const wanted = term.trim()
    if (!isSearchable(wanted)) {
      setError('Escribe al menos dos caracteres del nombre, el correo o el teléfono.')
      return
    }
    setError(null)
    setChosen(null)
    setSearching(true)
    try {
      setFound(await backofficeApi.searchSupportPeople({ query: wanted, caseReference: '' }))
    } catch (failure) {
      setFound(null)
      setError(searchFailureMessage(failure))
    } finally {
      setSearching(false)
    }
  }

  function grant() {
    if (!chosen || !isValidPersonId(chosen.person_id)) {
      setError('Elige a la persona que recibe el rol.')
      return
    }
    const personId = chosen.person_id
    setError(null)
    setChosen(null)
    setFound(null)
    setTerm('')
    onGrant(personId)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Rol base
        </CardTitle>
        <CardDescription>
          `allfit_admin` trae todos los deberes mientras dure. Nadie se lo otorga a sí mismo, y
          retirarlo revoca sus deberes y cierra su sesión.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => void search(event)}
          data-backoffice-form
          data-platform-form
          noValidate
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="platform-role-person">Buscar a quien recibe el rol</FieldLabel>
              <Input
                id="platform-role-person"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Nombre, correo o teléfono"
                autoComplete="off"
                disabled={busy || searching}
              />
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
            <div data-form-actions>
              <Button type="submit" variant="outline" disabled={busy || searching}>
                {searching ? 'Buscando…' : 'Buscar'}
              </Button>
            </div>
          </FieldGroup>
        </form>
        <p data-role-search-note>
          La búsqueda queda registrada, y cada persona que aparece la ve en su historial.
        </p>

        {found ? (
          found.items.length === 0 ? (
            <p data-role-candidates-empty>Nadie coincide con esa búsqueda.</p>
          ) : (
            <ul data-role-candidates aria-label="Personas que coinciden">
              {found.items.map((person) => (
                <li key={person.person_id} data-role-candidate={person.person_id}>
                  <strong>{person.display_name}</strong>{' '}
                  <span>{person.contact_email ?? 'Sin correo'}</span>{' '}
                  <Button
                    type="button"
                    size="sm"
                    variant={chosen?.person_id === person.person_id ? 'default' : 'outline'}
                    aria-pressed={chosen?.person_id === person.person_id}
                    disabled={busy}
                    onClick={() => setChosen(person)}
                  >
                    Elegir
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {found?.has_more ? (
          <p data-role-candidates-more>Coinciden más personas: escribe algo más preciso.</p>
        ) : null}

        {chosen ? (
          <div data-role-chosen>
            <p>
              Recibirá el rol base: <strong>{chosen.display_name}</strong>
              {chosen.contact_email ? ` (${chosen.contact_email})` : ''}
            </p>
            <Button type="button" disabled={busy} onClick={grant}>
              Otorgar rol base
            </Button>
          </div>
        ) : null}

        <Table scrollAreaLabel="Asignaciones de rol base">
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Otorgó</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead>Retirado</TableHead>
              <TableHead align="end">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.length === 0 ? (
              <TableState
                colSpan={6}
                state="empty"
                title="Nadie tiene rol base"
                description="Sólo la ceremonia de arranque puede crear los primeros dos administradores."
              />
            ) : (
              assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <PersonCell name={assignment.person_name} personId={assignment.person_id} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleStatusTone(assignment.status)}>
                      {roleStatusLabel(assignment.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <PersonCell
                      name={assignment.granted_by_name}
                      personId={assignment.granted_by_person_id}
                    />
                  </TableCell>
                  <TableCell>{formatInstant(assignment.granted_at)}</TableCell>
                  <TableCell>{formatInstant(assignment.revoked_at)}</TableCell>
                  <TableCell align="end">
                    {assignment.status === 'active' ? (
                      <AlertDialog
                        open={revoking === assignment.id}
                        onOpenChange={(next) => {
                          // Closing mid-flight would hide a request that is still going to land.
                          if (busy) return
                          setRevoking(next ? assignment.id : null)
                        }}
                      >
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => setRevoking(assignment.id)}
                        >
                          Retirar
                        </Button>
                        <AlertDialogContent data-revoke-role-dialog>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Retirar el rol base?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {personName(assignment.person_name)} deja de poder entrar al
                              Backoffice ahora mismo: se cierran sus deberes vigentes y su sesión.
                              No se puede deshacer; volver a darle acceso exige otorgar el rol de
                              nuevo.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={busy}>Conservar el rol</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={busy}
                              onClick={() =>
                                void onRevoke(assignment.id).then(() => setRevoking(null))
                              }
                            >
                              {busy ? 'Retirando…' : 'Retirar el rol'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <span>—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <LoadMore
          label="Ver más asignaciones de rol base"
          hasMore={hasMore}
          appending={appending}
          onLoadMore={onLoadMore}
        />
      </CardContent>
    </Card>
  )
}

function DutySection({
  assignments,
  filter,
  onFilter,
  busy,
  hasMore,
  appending,
  onLoadMore,
  onSuspend,
  onRevoke,
  onRecertify,
}: {
  assignments: PlatformDutyAssignment[]
  filter: DutyFilter
  onFilter: (next: DutyFilter) => void
  busy: boolean
  hasMore: boolean
  appending: boolean
  onLoadMore: () => void
  onSuspend: (assignmentId: string) => void
  onRevoke: (assignmentId: string) => Promise<void>
  onRecertify: (assignmentId: string) => void
}) {
  const [revoking, setRevoking] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Deberes de plataforma
        </CardTitle>
        <CardDescription>
          El rol de administrador trae los trece deberes, con AAL2, y duran lo que dure el rol. Un
          deber temporal de antes vence en su fecha y aún se puede suspender o revocar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup data-platform-duty-filters>
          <Field>
            <FieldLabel htmlFor="platform-duty-status-filter">Estado del deber</FieldLabel>
            <Select
              value={filter.status === '' ? ALL : filter.status}
              onValueChange={(value) =>
                onFilter({
                  ...filter,
                  status: value === ALL || value === null ? '' : (value as PlatformDutyStatus),
                })
              }
            >
              <SelectTrigger id="platform-duty-status-filter" disabled={busy}>
                <SelectValue>
                  {DUTY_STATUS_FILTERS.find((option) => option.value === filter.status)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DUTY_STATUS_FILTERS.map((option) => (
                  <SelectItem key={option.value || ALL} value={option.value || ALL}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="platform-duty-code-filter">Filtrar por deber</FieldLabel>
            <Select
              value={filter.dutyCode === '' ? ALL : filter.dutyCode}
              onValueChange={(value) =>
                onFilter({
                  ...filter,
                  dutyCode: value === ALL || value === null ? '' : (value as PlatformDutyCode),
                })
              }
            >
              <SelectTrigger id="platform-duty-code-filter" disabled={busy}>
                <SelectValue>
                  {filter.dutyCode === '' ? 'Todos los deberes' : dutyLabel(filter.dutyCode)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los deberes</SelectItem>
                {PLATFORM_DUTY_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {dutyLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <Table scrollAreaLabel="Asignaciones de deber">
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Deber</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>AAL</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Otorgó</TableHead>
              <TableHead>Recertificado</TableHead>
              <TableHead align="end">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.length === 0 ? (
              <TableState
                colSpan={9}
                state="empty"
                title="Nadie tiene deberes"
                description="Los deberes llegan con el rol de administrador."
              />
            ) : (
              assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <PersonCell name={assignment.person_name} personId={assignment.person_id} />
                  </TableCell>
                  <TableCell>{dutyLabel(assignment.duty_code)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{actorModeLabel(assignment.actor_mode)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={dutyStatusTone(assignment.status)}>
                      {dutyStatusLabel(assignment.status)}
                    </Badge>
                  </TableCell>
                  <TableCell numeric>{assignment.required_aal}</TableCell>
                  <TableCell>{dutyWindowLabel(assignment)}</TableCell>
                  <TableCell>
                    <PersonCell
                      name={assignment.granted_by_name}
                      personId={assignment.granted_by_person_id}
                    />
                  </TableCell>
                  <TableCell>{formatInstant(assignment.recertified_at)}</TableCell>
                  <TableCell align="end">
                    {isDutyClosed(assignment.status) ? (
                      <span>—</span>
                    ) : isHeldThroughRole(assignment) ? (
                      <span>Sigue al rol</span>
                    ) : (
                      <>
                        {canRecertify(assignment.status) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => onRecertify(assignment.id)}
                          >
                            Recertificar
                          </Button>
                        ) : null}
                        {assignment.status !== 'suspended' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => onSuspend(assignment.id)}
                          >
                            Suspender
                          </Button>
                        ) : null}
                        <AlertDialog
                          open={revoking === assignment.id}
                          onOpenChange={(next) => {
                            if (busy) return
                            setRevoking(next ? assignment.id : null)
                          }}
                        >
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => setRevoking(assignment.id)}
                          >
                            Revocar
                          </Button>
                          <AlertDialogContent data-revoke-duty-dialog>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Revocar este deber?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {personName(assignment.person_name)} deja de poder{' '}
                                {dutyLabel(assignment.duty_code).toLowerCase()} desde la siguiente
                                transacción. A diferencia de suspender, no se puede deshacer: para
                                devolvérselo hay que otorgar un deber nuevo.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={busy}>
                                Conservar el deber
                              </AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                disabled={busy}
                                onClick={() =>
                                  void onRevoke(assignment.id).then(() => setRevoking(null))
                                }
                              >
                                {busy ? 'Revocando…' : 'Revocar el deber'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <LoadMore
          label="Ver más deberes"
          hasMore={hasMore}
          appending={appending}
          onLoadMore={onLoadMore}
        />
      </CardContent>
    </Card>
  )
}

/**
 * Absent when there is nothing left, so its presence is the honest signal that
 * the list on screen is not the whole history.
 */
function LoadMore({
  label,
  hasMore,
  appending,
  onLoadMore,
}: {
  label: string
  hasMore: boolean
  appending: boolean
  onLoadMore: () => void
}) {
  if (!hasMore) return null
  return (
    <Button type="button" variant="outline" size="sm" disabled={appending} onClick={onLoadMore}>
      {appending ? 'Cargando…' : label}
    </Button>
  )
}

/** The name reads first; the short identifier stays beside it for a case, whole on hover. */
function PersonCell({ name, personId }: { name: string | null; personId: string }) {
  return (
    <span data-person-cell>
      {personName(name)} <code title={personId}>{shortIdentifier(personId)}</code>
    </span>
  )
}

function searchFailureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return platformAccessMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return supportMetadataMessage(error.code)
  return platformAccessMessage('upstream-unavailable')
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return platformAccessMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return platformAccessMessage(error.code)
  return platformAccessMessage('upstream-unavailable')
}
