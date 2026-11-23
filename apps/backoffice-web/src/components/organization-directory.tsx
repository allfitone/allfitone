'use client'

/**
 * `HU-BO-012` — finding a gym and seeing whether it operates.
 *
 * Four decisions, and none of them is layout.
 *
 * **Unclaimed is told apart, not merely labelled.** An organization Allfit created
 * for a sale exists but does not operate until its owner accepts. It carries its
 * own state, tone and meaning, so it never reads as a working gym that is quiet.
 *
 * **An unknown count is not zero.** People served is counted from service
 * relationships, which do not exist yet. The column says so rather than printing a
 * zero that would claim the gym serves nobody.
 *
 * **The search lives in the address.** Going back from a gym's file lands on the
 * list the operator left, and a link from Inicio arrives already filtered.
 *
 * **Nothing here identifies a person.** The directory is organizations only: no
 * legal name — for an independent professional it is a person's name — and no
 * owner. Who owns a gym belongs to its file, not to a list anyone may scroll.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import { FieldError } from '@allfitone/react/components/field'
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
import { FoundationIcon } from '@allfitone/react/icons'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  type BackofficeOrganizationSummary,
} from '@/lib/backoffice-api'
import {
  EMPTY_DIRECTORY_FILTERS,
  ORGANIZATION_STATUSES,
  directoryAddress,
  directoryAnswer,
  directoryFilterIssue,
  directoryFilterIssueMessage,
  directoryFiltersFromAddress,
  directoryMessage,
  isFiltered,
  peopleServedLabel,
  statusFilterLabel,
  statusLabel,
  statusMeaning,
  statusTone,
  toDirectoryQuery,
  type DirectoryFilters,
  type OrganizationStatus,
} from '@/lib/organization-directory'
import { formatInstant } from '@/lib/platform-access'
import { isRefusal } from '@/lib/screen-state'

import { PageHeader } from './page-header'
import { ScreenEmpty, ScreenFailure, ScreenLoading } from './screen-state'

type LoadState = 'loading' | 'ready' | 'failed'

const ANY = 'any'

export function OrganizationDirectory() {
  const router = useRouter()
  const search = useSearchParams().toString()
  const applied = useMemo(() => directoryFiltersFromAddress(new URLSearchParams(search)), [search])
  const [state, setState] = useState<LoadState>('loading')
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [organizations, setOrganizations] = useState<BackofficeOrganizationSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [appending, setAppending] = useState(false)
  const [appendFailure, setAppendFailure] = useState<string | null>(null)
  const [draft, setDraft] = useState<DirectoryFilters>(applied)
  // Keyed by the address, not by the object: a recomputed memo must not wipe what is typed.
  const appliedAddress = directoryAddress(applied)
  const [draftFor, setDraftFor] = useState(appliedAddress)
  const [issue, setIssue] = useState<string | null>(null)

  // Going back or forward changes the address: the toolbar shows what it now asks.
  if (draftFor !== appliedAddress) {
    setDraftFor(appliedAddress)
    setDraft(applied)
  }

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const page = await backofficeApi.organizations(toDirectoryQuery(applied), controller.signal)
        setOrganizations(page.data)
        setCursor(page.page.next_cursor)
        setState('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof BackofficeApiError && error.status === 401) {
          window.location.assign('/')
          return
        }
        setRefused(isRefusal(error))
        setFailure(failureMessage(error))
        setState('failed')
      }
    })()
    return () => controller.abort()
  }, [applied])

  function show(filters: DirectoryFilters) {
    setIssue(null)
    setAppendFailure(null)
    const address = directoryAddress(filters)
    if (address === appliedAddress) return
    setState('loading')
    router.replace(address)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const broken = directoryFilterIssue(draft)
    if (broken) {
      setIssue(directoryFilterIssueMessage(broken))
      return
    }
    show(draft)
  }

  async function loadMore() {
    if (!cursor) return
    setAppending(true)
    setAppendFailure(null)
    try {
      const page = await backofficeApi.organizations(toDirectoryQuery(applied, cursor))
      setOrganizations((current) => [...current, ...page.data])
      setCursor(page.page.next_cursor)
    } catch (error) {
      if (error instanceof BackofficeApiError && error.status === 401) {
        window.location.assign('/')
        return
      }
      setAppendFailure(failureMessage(error))
    } finally {
      setAppending(false)
    }
  }

  const create = (
    <Button render={<Link href="/organizations/new" />} nativeButton={false}>
      <FoundationIcon name="add" decorative />
      Crear un gimnasio
    </Button>
  )

  return (
    <div data-organization-directory>
      <PageHeader
        description="Por su nombre visible. El directorio muestra organizaciones, nunca personas: ni la razón social ni quién es su dueño."
        actions={create}
      />

      <form
        onSubmit={submit}
        role="search"
        aria-label="Buscar gimnasios"
        data-list-toolbar
        noValidate
      >
        <div data-list-search>
          <Input
            type="search"
            aria-label="Nombre"
            aria-invalid={issue ? true : undefined}
            aria-describedby={issue ? 'org-query-issue' : undefined}
            value={draft.query}
            onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
            placeholder="Buscar por nombre"
            autoComplete="off"
            disabled={state === 'loading'}
          />
          {issue ? <FieldError id="org-query-issue">{issue}</FieldError> : null}
        </div>
        <div data-list-filter>
          {/* Without the labels the trigger shows the raw state until the popup
              has opened once, which is exactly what a filtered link lands on. */}
          <Select
            items={[
              { value: ANY, label: 'Todos los estados' },
              ...ORGANIZATION_STATUSES.map((option) => ({
                value: option,
                label: statusLabel(option),
              })),
            ]}
            value={draft.status}
            onValueChange={(next) =>
              setDraft((current) => ({
                ...current,
                status: (next ?? ANY) as OrganizationStatus | typeof ANY,
              }))
            }
          >
            <SelectTrigger aria-label="Estado">
              <SelectValue>
                {draft.status === ANY ? 'Todos los estados' : statusFilterLabel(draft.status)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todos los estados</SelectItem>
              {ORGANIZATION_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {statusLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="outline" disabled={state === 'loading'}>
          Buscar
        </Button>
      </form>

      {state === 'loading' ? <ScreenLoading label="Cargando los gimnasios" /> : null}

      {state === 'failed' ? (
        <ScreenFailure
          refused={refused}
          duties={['manage_organization_lifecycle', 'diagnose_support_metadata']}
          title="No se pudo leer el directorio"
          message={failure ?? directoryMessage('upstream-unavailable')}
        />
      ) : null}

      {state === 'ready' && organizations.length === 0 ? (
        isFiltered(applied) ? (
          <ScreenEmpty
            icon="search"
            title={directoryAnswer(0, false, applied)}
            actions={
              <Button variant="outline" onClick={() => show(EMPTY_DIRECTORY_FILTERS)}>
                Quitar los filtros
              </Button>
            }
          >
            El nombre se busca en el nombre visible del gimnasio, nunca en su razón social.
          </ScreenEmpty>
        ) : (
          <ScreenEmpty
            icon="organization"
            title={directoryAnswer(0, false, applied)}
            actions={create}
          >
            Un gimnasio aparece aquí cuando su dueño lo crea en Studio, o cuando Allfit One lo crea
            para una venta.
          </ScreenEmpty>
        )
      ) : null}

      {state === 'ready' && organizations.length > 0 ? (
        <div data-list-results>
          <p data-list-count role="status">
            {directoryAnswer(organizations.length, cursor !== null, applied)}
          </p>
          <Table scrollAreaLabel="Gimnasios">
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Personas que atiende</TableHead>
                <TableHead>Equipo activo</TableHead>
                <TableHead>Sedes</TableHead>
                <TableHead>Creado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((organization) => (
                <TableRow
                  key={organization.organization_id}
                  data-organization-row
                  data-status={organization.status}
                >
                  <TableCell>
                    {/* A gym nobody has claimed opens on its handover; any other on its file. */}
                    <Link
                      href={
                        organization.status === 'unclaimed' || organization.status === 'cancelled'
                          ? `/organizations/${organization.organization_id}/handover`
                          : `/organizations/${organization.organization_id}`
                      }
                      data-handover-link
                    >
                      {organization.display_name}
                    </Link>
                  </TableCell>
                  <TableCell>{organization.type_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={statusTone(organization.status)}
                      title={statusMeaning(organization.status)}
                    >
                      {statusLabel(organization.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{peopleServedLabel(organization.people_served)}</TableCell>
                  <TableCell>{organization.active_member_count}</TableCell>
                  <TableCell>{organization.site_count}</TableCell>
                  <TableCell>{formatInstant(organization.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p data-list-note>
            «Sin reclamar» es un gimnasio que Allfit One creó y cuyo dueño todavía no aceptó:
            existe, pero no opera.
          </p>

          {appendFailure ? (
            <Alert live="assertive" variant="danger">
              <AlertTitle>No se pudieron cargar más gimnasios</AlertTitle>
              <AlertDescription>{appendFailure}</AlertDescription>
            </Alert>
          ) : null}

          {cursor ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={appending}
              onClick={() => void loadMore()}
            >
              {appending ? 'Cargando…' : 'Ver más gimnasios'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return directoryMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return directoryMessage(error.code)
  return directoryMessage('upstream-unavailable')
}
