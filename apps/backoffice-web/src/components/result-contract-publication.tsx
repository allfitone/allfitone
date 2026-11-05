'use client'

/**
 * `HU-BO-023` — publishing what an activity requires for a session to count as
 * complete.
 *
 * The activity type is chosen from the global catalogue rather than typed:
 * `OP-CAT-008` and `OP-CAT-012` are read on `/backoffice/v1/catalog`, the same
 * published content Studio and Space read, served where the Backoffice session
 * cookie travels. Pasting an identifier was only ever a stand-in for that read.
 *
 * Showing what is already effective before publishing matters: a correction is a
 * new version, never an edit, and the operator should see which version they are
 * about to supersede. What the response then carries is the evidence the story
 * asks for — the version number the server assigned, and the association it
 * closed with the window that closed it.
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { Textarea } from '@allfitone/react/components/textarea'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type ActivityTypeResultContract,
  type CatalogActivityType,
  type CatalogDiscipline,
  type ResultContract,
} from '@/lib/backoffice-api'
import { formatInstant } from '@/lib/platform-access'
import {
  ACTIVITY_FAMILIES,
  activityFamilyLabel,
  catalogueReadMessage,
  contractStatusLabel,
  effectiveContractLabel,
  emptyFixtures,
  fixtureIssue,
  fixtureIssueMessage,
  fixturesDemonstrateBothOutcomes,
  groupActivityTypes,
  isValidActivityTypeId,
  isValidContractCode,
  parseJsonDocument,
  resultContractMessage,
  toContractFixtures,
  versionLine,
  versionsSummary,
  type ResultContractVersion,
  type ActivityFamily,
  type FixtureDraft,
} from '@/lib/result-contracts'

export function ResultContractPublication() {
  const [contractCode, setContractCode] = useState('')
  const [activityFamily, setActivityFamily] = useState<ActivityFamily>('strength')
  const [activityTypeId, setActivityTypeId] = useState('')
  const [envelope, setEnvelope] = useState('{\n  "schema": 1\n}')
  const [minimums, setMinimums] = useState('{\n  "target_sets": true\n}')
  const [fixtures, setFixtures] = useState<FixtureDraft[]>(emptyFixtures)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [published, setPublished] = useState<ResultContract | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null)
  const [disciplines, setDisciplines] = useState<CatalogDiscipline[]>([])
  const [activityTypes, setActivityTypes] = useState<CatalogActivityType[]>([])
  const [catalogueError, setCatalogueError] = useState<string | null>(null)
  const [effective, setEffective] = useState<ActivityTypeResultContract[] | null>(null)
  const [catalogueRevision, setCatalogueRevision] = useState(0)
  const [versions, setVersions] = useState<ResultContractVersion[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const [readDisciplines, readActivityTypes] = await Promise.all([
          backofficeApi.catalogDisciplines(controller.signal),
          backofficeApi.catalogActivityTypes(controller.signal),
        ])
        setDisciplines(readDisciplines.items)
        setActivityTypes(readActivityTypes.items)
        setCatalogueError(null)
      } catch (failure) {
        if (controller.signal.aborted) return
        setCatalogueError(catalogueFailureMessage(failure))
      }
    })()
    return () => controller.abort()
  }, [])

  // The effective associations are what this publication would supersede, so they
  // are read for the chosen type and never carried across a change of type.
  useEffect(() => {
    if (!isValidActivityTypeId(activityTypeId)) {
      setEffective(null)
      return
    }
    const controller = new AbortController()
    void (async () => {
      try {
        const read = await backofficeApi.catalogActivityTypeResultContracts(
          activityTypeId,
          controller.signal,
        )
        setEffective(read.items)
      } catch {
        if (!controller.signal.aborted) setEffective(null)
      }
    })()
    return () => controller.abort()
  }, [activityTypeId, catalogueRevision])

  // HU-BO-023: every version of the chosen type, so an older one can be deprecated too.
  useEffect(() => {
    if (!isValidActivityTypeId(activityTypeId)) {
      setVersions(null)
      return
    }
    const controller = new AbortController()
    void (async () => {
      try {
        const read = await backofficeApi.resultContractVersions(activityTypeId, controller.signal)
        setVersions(read.items)
      } catch {
        if (!controller.signal.aborted) setVersions(null)
      }
    })()
    return () => controller.abort()
  }, [activityTypeId, catalogueRevision])

  const activityTypeGroups = useMemo(
    () => groupActivityTypes(activityTypes, disciplines),
    [activityTypes, disciplines],
  )

  function updateFixture(index: number, patch: Partial<FixtureDraft>) {
    setFixtures((current) =>
      current.map((draft, position) => (position === index ? { ...draft, ...patch } : draft)),
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!isValidContractCode(contractCode)) {
      setError('El código va en minúsculas, con puntos o guiones bajos, y al menos dos caracteres.')
      return
    }
    if (!isValidActivityTypeId(activityTypeId)) {
      setError('Elige el tipo de actividad al que aplica el contrato.')
      return
    }
    const parsedEnvelope = parseJsonDocument(envelope)
    if (!parsedEnvelope.ok) {
      setError('El envelope debe ser un objeto JSON.')
      return
    }
    const parsedMinimums = parseJsonDocument(minimums)
    if (!parsedMinimums.ok) {
      setError('Los mínimos deben ser un objeto JSON.')
      return
    }
    const broken = fixtures.map(fixtureIssue).find((issue) => issue !== undefined)
    if (broken) {
      setError(fixtureIssueMessage(broken))
      return
    }
    if (!fixturesDemonstrateBothOutcomes(fixtures)) {
      setError('Hace falta un caso que el contrato acepte y uno que rechace.')
      return
    }

    setError(null)
    setBusy(true)
    setNotice(null)
    try {
      const resource = await backofficeApi.publishResultContract(
        {
          contract_code: contractCode,
          activity_family: activityFamily,
          envelope: parsedEnvelope.value,
          minimums: parsedMinimums.value,
          fixtures: toContractFixtures(fixtures),
          activity_type_id: activityTypeId,
        },
        newBackofficeCommand(),
      )
      setPublished(resource)
      setCatalogueRevision((current) => current + 1)
      setNotice({
        tone: 'success',
        message: `Publicada la versión ${resource.version_number} de ${resource.contract_code}.`,
      })
    } catch (failure) {
      setNotice({ tone: 'danger', message: failureMessage(failure) })
    } finally {
      setBusy(false)
    }
  }

  async function deprecateVersion(contract: ResultContractVersion) {
    setBusy(true)
    setNotice(null)
    try {
      const resource = await backofficeApi.deprecateResultContract(
        contract.id,
        newBackofficeCommand(),
      )
      if (published?.id === resource.id) setPublished(resource)
      setCatalogueRevision((current) => current + 1)
      setNotice({
        tone: 'success',
        message: `Deprecada la versión ${resource.version_number} de ${resource.contract_code}. Las ejecuciones que ya la congelaron siguen válidas.`,
      })
    } catch (failure) {
      setNotice({ tone: 'danger', message: failureMessage(failure) })
    } finally {
      setBusy(false)
    }
  }

  async function deprecate() {
    if (!published) return
    setBusy(true)
    setNotice(null)
    try {
      const resource = await backofficeApi.deprecateResultContract(
        published.id,
        newBackofficeCommand(),
      )
      setPublished(resource)
      setCatalogueRevision((current) => current + 1)
      setNotice({
        tone: 'success',
        message: 'Contrato deprecado. Las ejecuciones que ya lo congelaron siguen válidas.',
      })
    } catch (failure) {
      setNotice({ tone: 'danger', message: failureMessage(failure) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-result-contracts>
      {notice ? (
        <Alert live="polite" variant={notice.tone === 'success' ? 'success' : 'danger'}>
          <AlertTitle>{notice.tone === 'success' ? 'Hecho' : 'No se publicó'}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      {catalogueError ? (
        <Alert live="polite" variant="warning">
          <AlertTitle>No se pudo leer el catálogo global</AlertTitle>
          <AlertDescription>{catalogueError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Publicar reglas de validación
          </CardTitle>
          <CardDescription>
            Una versión publicada no se edita: corregirla exige publicar la siguiente, y publicarla
            no reinterpreta las sesiones ya registradas. El servidor asigna el número de versión.
          </CardDescription>
          {/* HU-BO-023 c1: publishing does not change what counts as complete yet; say so. */}
          <Alert live="off" variant="info" data-contract-minimums-note>
            <AlertTitle>Los mínimos todavía no se aplican</AlertTitle>
            <AlertDescription>
              Hoy la ejecución da por completa una sesión con al menos un resultado. Los mínimos que
              publiques quedan guardados con la versión y se aplicarán cuando la ejecución los lea.
            </AlertDescription>
          </Alert>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} data-backoffice-form data-result-contract-form noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="contract-code">Código del contrato</FieldLabel>
                <Input
                  id="contract-code"
                  value={contractCode}
                  onChange={(event) => setContractCode(event.target.value)}
                  placeholder="strength.detailed"
                  autoComplete="off"
                  disabled={busy}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="contract-family">Familia de actividad</FieldLabel>
                <Select
                  value={activityFamily}
                  onValueChange={(value) => setActivityFamily(value as ActivityFamily)}
                >
                  <SelectTrigger id="contract-family" disabled={busy}>
                    <SelectValue>{activityFamilyLabel(activityFamily)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_FAMILIES.map((family) => (
                      <SelectItem key={family} value={family}>
                        {activityFamilyLabel(family)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="contract-activity-type">Tipo de actividad</FieldLabel>
                <Select
                  value={activityTypeId}
                  onValueChange={(value) => setActivityTypeId(value ?? '')}
                >
                  <SelectTrigger
                    id="contract-activity-type"
                    disabled={busy || activityTypeGroups.length === 0}
                  >
                    <SelectValue placeholder="Elige un tipo de actividad publicado" />
                  </SelectTrigger>
                  <SelectContent>
                    {activityTypeGroups.map((group) => (
                      <SelectGroup key={group.disciplineCode}>
                        <SelectLabel>{group.disciplineName}</SelectLabel>
                        {group.activityTypes.map((activityType) => (
                          <SelectItem key={activityType.id} value={activityType.id}>
                            {activityType.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="contract-envelope">Envelope</FieldLabel>
                <Textarea
                  id="contract-envelope"
                  value={envelope}
                  onChange={(event) => setEnvelope(event.target.value)}
                  rows={5}
                  disabled={busy}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="contract-minimums">Mínimos por completitud</FieldLabel>
                <Textarea
                  id="contract-minimums"
                  value={minimums}
                  onChange={(event) => setMinimums(event.target.value)}
                  rows={5}
                  disabled={busy}
                />
              </Field>
              {fixtures.map((draft, index) => (
                <Field key={draft.kind}>
                  <FieldLabel htmlFor={`contract-fixture-${draft.kind}`}>
                    {draft.kind === 'valid' ? 'Caso que el contrato acepta' : 'Caso que rechaza'}
                  </FieldLabel>
                  <Textarea
                    id={`contract-fixture-${draft.kind}`}
                    value={draft.payload}
                    onChange={(event) => updateFixture(index, { payload: event.target.value })}
                    rows={3}
                    disabled={busy}
                  />
                  <Input
                    aria-label={
                      draft.kind === 'valid'
                        ? 'Resultado esperado del caso aceptado'
                        : 'Resultado esperado del caso rechazado'
                    }
                    value={draft.expected}
                    onChange={(event) => updateFixture(index, { expected: event.target.value })}
                    placeholder={draft.kind === 'valid' ? 'accepted' : 'missing_sets'}
                    autoComplete="off"
                    disabled={busy}
                  />
                </Field>
              ))}
              {error ? <FieldError>{error}</FieldError> : null}
              <div data-form-actions>
                <Button type="submit" disabled={busy}>
                  Publicar versión
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {effective ? <EffectiveContracts contracts={effective} /> : null}

      {versions ? (
        <ContractVersions versions={versions} busy={busy} onDeprecate={deprecateVersion} />
      ) : null}

      {published ? (
        <PublishedContract contract={published} busy={busy} onDeprecate={deprecate} />
      ) : (
        <Alert live="off" variant="info">
          <AlertTitle>Todavía no publicaste una versión</AlertTitle>
          <AlertDescription>
            Aquí aparecerá la versión que el servidor asigne, con sus casos de prueba y la
            asociación que reemplace.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

/**
 * What the chosen activity type already validates against. A published version is
 * immutable, so this is what the next version would supersede — not something to
 * edit here.
 */
function EffectiveContracts({ contracts }: { contracts: readonly ActivityTypeResultContract[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Contratos vigentes de este tipo de actividad
        </CardTitle>
        <CardDescription>
          {contracts.length === 0
            ? 'Ninguno vigente todavía. La versión que publiques será la primera.'
            : 'Publicar una versión nueva cierra la asociación vigente en lugar de editarla.'}
        </CardDescription>
      </CardHeader>
      {contracts.length > 0 ? (
        <CardContent>
          <Table scrollAreaLabel="Contratos vigentes">
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead>Familia</TableHead>
                <TableHead>Vigente desde</TableHead>
                <TableHead>Mínimos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.result_contract_id}>
                  <TableCell>{effectiveContractLabel(contract)}</TableCell>
                  <TableCell>{activityFamilyLabel(contract.activity_family)}</TableCell>
                  <TableCell>{formatInstant(contract.valid_from)}</TableCell>
                  <TableCell>
                    <code>{JSON.stringify(contract.minimums)}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      ) : null}
    </Card>
  )
}

/** Every version of the chosen type, newest first; any in force can be deprecated. */
function ContractVersions({
  versions,
  busy,
  onDeprecate,
}: {
  versions: ResultContractVersion[]
  busy: boolean
  onDeprecate: (contract: ResultContractVersion) => Promise<void>
}) {
  const [deprecating, setDeprecating] = useState<string | null>(null)

  return (
    <Card data-contract-versions>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Versiones de este tipo
        </CardTitle>
        <CardDescription data-contract-versions-summary>
          {versionsSummary(versions)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {versions.length > 0 ? (
          <ul>
            {versions.map((contract) => (
              <li key={contract.id} data-contract-version={contract.status}>
                {versionLine(contract)} Publicada el {formatInstant(contract.published_at)}.{' '}
                {contract.status === 'published' ? (
                  <AlertDialog
                    open={deprecating === contract.id}
                    onOpenChange={(next) => {
                      // Closing mid-flight would hide a request that is still going to land.
                      if (busy) return
                      setDeprecating(next ? contract.id : null)
                    }}
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      aria-label={`Deprecar la versión ${contract.version_number} de ${contract.contract_code}`}
                      onClick={() => setDeprecating(contract.id)}
                    >
                      Deprecar
                    </Button>
                    <AlertDialogContent data-deprecate-version-dialog>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          ¿Deprecar la versión {contract.version_number} de {contract.contract_code}
                          ?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Ninguna sesión nueva volverá a validarse con ella. Las sesiones que ya la
                          congelaron conservan el contrato tal como lo aceptaron.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Conservar la versión</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            void onDeprecate(contract).then(() => setDeprecating(null))
                          }
                        >
                          {busy ? 'Deprecando…' : 'Deprecar'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

function PublishedContract({
  contract,
  busy,
  onDeprecate,
}: {
  contract: ResultContract
  busy: boolean
  onDeprecate: () => Promise<void>
}) {
  const [deprecating, setDeprecating] = useState(false)
  const superseded = contract.activity_type_bindings.filter((binding) => binding.valid_to !== null)

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Versión publicada
        </CardTitle>
        <CardDescription>
          {contract.contract_code} · versión {contract.version_number} ·{' '}
          {activityFamilyLabel(contract.activity_family)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="responsive">
            <FieldLabel htmlFor="published-status">Estado</FieldLabel>
            <Badge
              id="published-status"
              variant={contract.status === 'published' ? 'success' : 'secondary'}
            >
              {contractStatusLabel(contract.status)}
            </Badge>
          </Field>
        </FieldGroup>

        <Table scrollAreaLabel="Casos de prueba del contrato">
          <TableHeader>
            <TableRow>
              <TableHead>Caso</TableHead>
              <TableHead>Contenido</TableHead>
              <TableHead>Esperado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contract.fixtures.map((fixture) => (
              <TableRow key={fixture.id}>
                <TableCell>
                  <Badge variant={fixture.kind === 'valid' ? 'success' : 'destructive'}>
                    {fixture.kind === 'valid' ? 'Aceptado' : 'Rechazado'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <code>{JSON.stringify(fixture.payload)}</code>
                </TableCell>
                <TableCell>{fixture.expected}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {superseded.length > 0 ? (
          <Alert live="polite" variant="info">
            <AlertTitle>Esta publicación reemplazó una asociación anterior</AlertTitle>
            <AlertDescription>
              La anterior se cerró el {formatInstant(superseded[0]?.valid_to)} en lugar de borrarse.
              Las sesiones registradas bajo ella conservan el contrato que congelaron.
            </AlertDescription>
          </Alert>
        ) : null}

        {contract.status === 'published' ? (
          <AlertDialog
            open={deprecating}
            onOpenChange={(next) => {
              // Closing mid-flight would hide a request that is still going to land.
              if (busy) return
              setDeprecating(next)
            }}
          >
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => setDeprecating(true)}
            >
              Deprecar esta versión
            </Button>
            <AlertDialogContent data-deprecate-contract-dialog>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿Deprecar la versión {contract.version_number} de {contract.contract_code}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Ninguna sesión nueva volverá a validarse con ella. Las sesiones que ya la
                  congelaron conservan el contrato tal como lo aceptaron. Una versión deprecada no
                  se vuelve a publicar: corregirla exige publicar la siguiente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Conservar la versión</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void onDeprecate().then(() => setDeprecating(false))}
                >
                  {busy ? 'Deprecando…' : 'Deprecar'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardContent>
    </Card>
  )
}

function catalogueFailureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return catalogueReadMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return catalogueReadMessage(error.code)
  return catalogueReadMessage('upstream-unavailable')
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return resultContractMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return resultContractMessage(error.code)
  return resultContractMessage('upstream-unavailable')
}
