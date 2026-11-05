'use client'

/**
 * `HU-BO-022` — publishing and archiving the global catalogue.
 *
 * Three decisions shape it.
 *
 * **Only Allfit's content is here.** A gym's private movements and activity types never
 * appear, and no form offers a scope or an owner: the commands do not take one, so the
 * screen cannot invent one.
 *
 * **Archiving is shown as what it is.** Each row says how much already depends on it and
 * the confirmation repeats that archiving withdraws it from search without breaking a
 * template that already uses it.
 *
 * **A code is never reused.** The form explains the shape a code must have and the server
 * refuses a code that already names something else; the screen does not pretend it can
 * rename one.
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
import { ScreenEmpty, ScreenFailure, ScreenLoading } from './screen-state'

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
} from '@allfitone/react/components/table'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type BackofficeCommand,
  type BackofficeGlobalCatalogue,
  type GlobalCatalogueEntry,
  type GlobalCatalogueEquipment,
} from '@/lib/backoffice-api'
import {
  catalogueCodeIssue,
  catalogueCommandMessage,
  catalogueKindLabel,
  catalogueNameIssue,
  catalogueOutcomeMessage,
  catalogueStatusLabel,
  catalogueStatusTone,
  equipmentDraft,
  equipmentInUseExplanation,
  equipmentItems,
  equipmentOutcomeMessage,
  globalCatalogueMessage,
  movementEquipmentOutcome,
  movementEquipmentSentence,
  publishedEquipment,
  type EquipmentChoice,
  inUseExplanation,
  isValidCatalogueCode,
  isValidCatalogueName,
  publishedDisciplines,
} from '@/lib/global-catalogue'
import { isRefusal } from '@/lib/screen-state'

type LoadState = 'loading' | 'ready' | 'failed'

export function GlobalCatalogue() {
  const [state, setState] = useState<LoadState>('loading')
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [catalogue, setCatalogue] = useState<BackofficeGlobalCatalogue | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [commandFailure, setCommandFailure] = useState<string | null>(null)
  const pending = useRef(new Map<string, BackofficeCommand>())

  const [disciplineCode, setDisciplineCode] = useState('')
  const [disciplineName, setDisciplineName] = useState('')
  const [activityDiscipline, setActivityDiscipline] = useState('')
  const [activityCode, setActivityCode] = useState('')
  const [activityName, setActivityName] = useState('')
  const [movementDiscipline, setMovementDiscipline] = useState('')
  const [movementName, setMovementName] = useState('')
  const [equipmentCode, setEquipmentCode] = useState('')
  const [equipmentName, setEquipmentName] = useState('')
  const [editing, setEditing] = useState<GlobalCatalogueEntry | null>(null)
  const [draft, setDraft] = useState<Record<string, EquipmentChoice>>({})
  const [formIssue, setFormIssue] = useState<Record<string, string>>({})

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        setCatalogue(await backofficeApi.globalCatalogue(controller.signal))
        setState('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof BackofficeApiError && error.status === 401) {
          window.location.assign('/')
          return
        }
        setRefused(isRefusal(error))
        setFailure(readFailure(error))
        setState('failed')
      }
    })()
    return () => controller.abort()
  }, [reload])

  async function run<T>(
    key: string,
    send: (command: BackofficeCommand) => Promise<T>,
    message: (result: T) => string,
    onDone?: () => void,
  ) {
    const command = pending.current.get(key) ?? newBackofficeCommand()
    pending.current.set(key, command)
    setBusy(key)
    setOutcome(null)
    setCommandFailure(null)
    try {
      const result = await send(command)
      pending.current.delete(key)
      setOutcome(message(result))
      onDone?.()
      setReload((value) => value + 1)
    } catch (error) {
      if (error instanceof BackofficeApiError && error.status === 401) {
        window.location.assign('/')
        return
      }
      if (error instanceof BackofficeNetworkError) {
        // The command may have landed; keep it so the retry replays instead of publishing.
        setCommandFailure(catalogueCommandMessage('network-unavailable'))
        return
      }
      const code = error instanceof BackofficeApiError ? error.code : 'unknown'
      if (code !== 'idempotency-in-progress') pending.current.delete(key)
      setCommandFailure(catalogueCommandMessage(code))
      if (code === 'conflict' || code === 'not-found') setReload((value) => value + 1)
    } finally {
      setBusy(null)
    }
  }

  function publishDiscipline(event: FormEvent) {
    event.preventDefault()
    if (!validate({ discipline_code: disciplineCode, discipline_name: disciplineName })) return
    void run(
      `discipline:${disciplineCode}`,
      (command) =>
        backofficeApi.publishCatalogueDiscipline(
          { code: disciplineCode.trim(), name: disciplineName.trim() },
          command,
        ),
      (entry) => catalogueOutcomeMessage('publish', entry),
      () => {
        setDisciplineCode('')
        setDisciplineName('')
      },
    )
  }

  function publishActivityType(event: FormEvent) {
    event.preventDefault()
    if (
      !validate({
        activity_discipline: activityDiscipline,
        activity_code: activityCode,
        activity_name: activityName,
      })
    ) {
      return
    }
    void run(
      `activity:${activityCode}`,
      (command) =>
        backofficeApi.publishCatalogueActivityType(
          {
            discipline_code: activityDiscipline,
            code: activityCode.trim(),
            name: activityName.trim(),
          },
          command,
        ),
      (entry) => catalogueOutcomeMessage('publish', entry),
      () => {
        setActivityCode('')
        setActivityName('')
      },
    )
  }

  function publishMovement(event: FormEvent) {
    event.preventDefault()
    if (!validate({ movement_discipline: movementDiscipline, movement_name: movementName })) return
    void run(
      `movement:${movementName.trim().toLowerCase()}`,
      (command) =>
        backofficeApi.publishCatalogueMovement(
          { discipline_code: movementDiscipline, name: movementName.trim() },
          command,
        ),
      (entry) => catalogueOutcomeMessage('publish', entry),
      () => setMovementName(''),
    )
  }

  function publishEquipment(event: FormEvent) {
    event.preventDefault()
    if (!validate({ equipment_code: equipmentCode, equipment_name: equipmentName })) return
    void run(
      `equipment:${equipmentCode}`,
      (command) =>
        backofficeApi.publishCatalogueEquipment(
          { code: equipmentCode.trim(), name: equipmentName.trim() },
          command,
        ),
      (item) => equipmentOutcomeMessage('publish', item),
      () => {
        setEquipmentCode('')
        setEquipmentName('')
      },
    )
  }

  const archiveEquipment = (item: GlobalCatalogueEquipment) =>
    run(
      `archive:${item.id}`,
      (command) => backofficeApi.archiveCatalogueEquipment(item.code, command),
      (archived) => equipmentOutcomeMessage('archive', archived),
    )

  function editEquipment(entry: GlobalCatalogueEntry) {
    setEditing(entry)
    setDraft(equipmentDraft(entry))
  }

  function saveEquipment() {
    if (!editing) return
    const movement = editing
    void run(
      `movement-equipment:${movement.id}`,
      (command) =>
        backofficeApi.setCatalogueMovementEquipment(
          movement.id,
          { items: equipmentItems(draft) },
          command,
        ),
      (saved) => movementEquipmentOutcome(saved),
      () => setEditing(null),
    )
  }

  /** Checked here only to answer sooner; the server refuses the same shapes. */
  function validate(fields: Record<string, string>): boolean {
    const issues: Record<string, string> = {}
    for (const [field, value] of Object.entries(fields)) {
      if (field.endsWith('_code') || field.endsWith('_discipline')) {
        if (!isValidCatalogueCode(value)) issues[field] = catalogueCodeIssue()
      } else if (!isValidCatalogueName(value)) {
        issues[field] = catalogueNameIssue()
      }
    }
    setFormIssue(issues)
    return Object.keys(issues).length === 0
  }

  const archive = (entry: GlobalCatalogueEntry) =>
    run(
      `archive:${entry.id}`,
      (command) =>
        backofficeApi.archiveCatalogueEntry(
          { kind: entry.kind, id: entry.id, code: entry.code },
          command,
        ),
      (archived) => catalogueOutcomeMessage('archive', archived),
    )

  const disciplineOptions = catalogue ? publishedDisciplines(catalogue) : []

  return (
    <div data-global-catalogue>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Catálogo global
          </CardTitle>
          <CardDescription>
            Lo que se publica aquí lo ven todos los gimnasios y todas las personas. Un gimnasio crea
            sus propios movimientos privados y nunca los sube aquí. Un código publicado es estable:
            no se reutiliza para otra cosa, y archivar retira de las búsquedas sin romper las
            sesiones ni las plantillas que ya lo usaban.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === 'loading' ? <ScreenLoading /> : null}

          {state === 'failed' ? (
            <ScreenFailure
              refused={refused}
              duties={['curate_global_catalog']}
              title="No se pudo leer el catálogo"
              message={failure ?? globalCatalogueMessage('upstream-unavailable')}
              onRetry={() => setReload((value) => value + 1)}
            />
          ) : null}

          {outcome ? (
            <Alert live="polite" variant="success" data-catalogue-outcome>
              <AlertTitle>Listo</AlertTitle>
              <AlertDescription>{outcome}</AlertDescription>
            </Alert>
          ) : null}

          {commandFailure ? (
            <Alert live="assertive" variant="danger" data-catalogue-failure>
              <AlertTitle>No se completó</AlertTitle>
              <AlertDescription>{commandFailure}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {state === 'ready' && catalogue ? (
        <>
          <CatalogueSection
            kind="discipline"
            title="Disciplinas"
            description="La familia de actividad a la que pertenece todo lo demás."
            entries={catalogue.disciplines}
            busy={busy}
            onArchive={archive}
            form={
              <form
                onSubmit={publishDiscipline}
                data-backoffice-form
                data-catalogue-form="discipline"
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="discipline-code">Código</FieldLabel>
                    <Input
                      id="discipline-code"
                      value={disciplineCode}
                      onChange={(event) => setDisciplineCode(event.target.value)}
                      placeholder="yoga"
                      disabled={busy !== null}
                    />
                    {formIssue.discipline_code ? (
                      <FieldError>{formIssue.discipline_code}</FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="discipline-name">Nombre</FieldLabel>
                    <Input
                      id="discipline-name"
                      value={disciplineName}
                      onChange={(event) => setDisciplineName(event.target.value)}
                      placeholder="Yoga"
                      disabled={busy !== null}
                    />
                    {formIssue.discipline_name ? (
                      <FieldError>{formIssue.discipline_name}</FieldError>
                    ) : null}
                  </Field>
                </FieldGroup>
                <div data-form-actions>
                  <Button type="submit" disabled={busy !== null}>
                    Publicar disciplina
                  </Button>
                </div>
              </form>
            }
          />

          <CatalogueSection
            kind="activity_type"
            title="Tipos de actividad"
            description="La clase concreta de actividad; decide qué reglas de resultado aplican."
            entries={catalogue.activity_types}
            busy={busy}
            onArchive={archive}
            form={
              <form
                onSubmit={publishActivityType}
                data-backoffice-form
                data-catalogue-form="activity_type"
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="activity-discipline">Disciplina</FieldLabel>
                    {/* With the labels the trigger reads the name, not the raw code. */}
                    <Select
                      items={disciplineOptions.map((entry) => ({
                        value: entry.code ?? '',
                        label: entry.name,
                      }))}
                      value={activityDiscipline}
                      onValueChange={(value) => setActivityDiscipline(String(value ?? ''))}
                    >
                      <SelectTrigger
                        id="activity-discipline"
                        disabled={busy !== null || disciplineOptions.length === 0}
                      >
                        <SelectValue placeholder="Elige una disciplina publicada" />
                      </SelectTrigger>
                      <SelectContent>
                        {disciplineOptions.map((entry) => (
                          <SelectItem key={entry.id} value={entry.code ?? ''}>
                            {entry.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formIssue.activity_discipline ? (
                      <FieldError>Elige una disciplina publicada.</FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="activity-code">Código</FieldLabel>
                    <Input
                      id="activity-code"
                      value={activityCode}
                      onChange={(event) => setActivityCode(event.target.value)}
                      placeholder="vinyasa"
                      disabled={busy !== null}
                    />
                    {formIssue.activity_code ? (
                      <FieldError>{formIssue.activity_code}</FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="activity-name">Nombre</FieldLabel>
                    <Input
                      id="activity-name"
                      value={activityName}
                      onChange={(event) => setActivityName(event.target.value)}
                      placeholder="Vinyasa"
                      disabled={busy !== null}
                    />
                    {formIssue.activity_name ? (
                      <FieldError>{formIssue.activity_name}</FieldError>
                    ) : null}
                  </Field>
                </FieldGroup>
                <div data-form-actions>
                  <Button type="submit" disabled={busy !== null}>
                    Publicar tipo de actividad
                  </Button>
                </div>
              </form>
            }
          />

          <CatalogueSection
            kind="movement"
            title="Movimientos"
            description="La acción o técnica reutilizable. Se identifica por su nombre, así que el mismo nombre escrito distinto es el mismo movimiento."
            entries={catalogue.movements}
            busy={busy}
            onArchive={archive}
            equipment={{ onEdit: editEquipment }}
            form={
              <form onSubmit={publishMovement} data-backoffice-form data-catalogue-form="movement">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="movement-discipline">Disciplina</FieldLabel>
                    <Select
                      items={disciplineOptions.map((entry) => ({
                        value: entry.code ?? '',
                        label: entry.name,
                      }))}
                      value={movementDiscipline}
                      onValueChange={(value) => setMovementDiscipline(String(value ?? ''))}
                    >
                      <SelectTrigger
                        id="movement-discipline"
                        disabled={busy !== null || disciplineOptions.length === 0}
                      >
                        <SelectValue placeholder="Elige una disciplina publicada" />
                      </SelectTrigger>
                      <SelectContent>
                        {disciplineOptions.map((entry) => (
                          <SelectItem key={entry.id} value={entry.code ?? ''}>
                            {entry.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formIssue.movement_discipline ? (
                      <FieldError>Elige una disciplina publicada.</FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="movement-name">Nombre</FieldLabel>
                    <Input
                      id="movement-name"
                      value={movementName}
                      onChange={(event) => setMovementName(event.target.value)}
                      placeholder="Guerrero II"
                      disabled={busy !== null}
                    />
                    {formIssue.movement_name ? (
                      <FieldError>{formIssue.movement_name}</FieldError>
                    ) : null}
                  </Field>
                </FieldGroup>
                <div data-form-actions>
                  <Button type="submit" disabled={busy !== null}>
                    Publicar movimiento
                  </Button>
                </div>
              </form>
            }
          />

          {editing ? (
            <MovementEquipmentEditor
              movement={editing}
              available={publishedEquipment(catalogue)}
              draft={draft}
              busy={busy}
              onChange={(code, choice) => setDraft((current) => ({ ...current, [code]: choice }))}
              onSave={saveEquipment}
              onCancel={() => setEditing(null)}
            />
          ) : null}

          <EquipmentSection
            entries={catalogue.equipment}
            busy={busy}
            onArchive={archiveEquipment}
            form={
              <form
                onSubmit={publishEquipment}
                data-backoffice-form
                data-catalogue-form="equipment"
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="equipment-code">Código</FieldLabel>
                    <Input
                      id="equipment-code"
                      value={equipmentCode}
                      onChange={(event) => setEquipmentCode(event.target.value)}
                      placeholder="barbell"
                      disabled={busy !== null}
                    />
                    {formIssue.equipment_code ? (
                      <FieldError>{formIssue.equipment_code}</FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="equipment-name">Nombre</FieldLabel>
                    <Input
                      id="equipment-name"
                      value={equipmentName}
                      onChange={(event) => setEquipmentName(event.target.value)}
                      placeholder="Barra olímpica"
                      disabled={busy !== null}
                    />
                    {formIssue.equipment_name ? (
                      <FieldError>{formIssue.equipment_name}</FieldError>
                    ) : null}
                  </Field>
                </FieldGroup>
                <div data-form-actions>
                  <Button type="submit" disabled={busy !== null}>
                    Publicar equipamiento
                  </Button>
                </div>
              </form>
            }
          />
        </>
      ) : null}
    </div>
  )
}

function CatalogueSection({
  kind,
  title,
  description,
  entries,
  busy,
  onArchive,
  equipment,
  form,
}: {
  kind: GlobalCatalogueEntry['kind']
  title: string
  description: string
  entries: GlobalCatalogueEntry[]
  busy: string | null
  onArchive: (entry: GlobalCatalogueEntry) => Promise<void>
  /** Movements only: what each uses, and the way to change it. */
  equipment?: { onEdit: (entry: GlobalCatalogueEntry) => void }
  form: ReactNode
}) {
  const [archiving, setArchiving] = useState<string | null>(null)

  return (
    <Card data-catalogue-section={kind}>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {form}

        {entries.length === 0 ? (
          <ScreenEmpty
            icon="training"
            title="Todavía no hay nada publicado aquí."
            data-catalogue-empty
          >
            Lo primero que publiques aparece en esta tabla con su código, su estado y cuánto lo usa
            ya la plataforma.
          </ScreenEmpty>
        ) : (
          <Table scrollAreaLabel={title}>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>{kind === 'movement' ? 'Disciplina' : 'Código'}</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>En uso</TableHead>
                <TableHead>Archivar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} data-catalogue-entry data-status={entry.status}>
                  <TableCell>
                    {entry.name}
                    {/* Under the name, so the table keeps five columns and archiving in view. */}
                    {equipment ? (
                      <div data-movement-equipment-cell>
                        <span data-movement-equipment>{movementEquipmentSentence(entry)}</span>{' '}
                        {entry.status === 'published' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy !== null}
                            aria-label={`Editar el equipamiento de ${entry.name}`}
                            onClick={() => equipment.onEdit(entry)}
                          >
                            Editar
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <code>{kind === 'movement' ? entry.discipline_code : entry.code}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={catalogueStatusTone(entry.status)}>
                      {catalogueStatusLabel(entry.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{inUseExplanation(entry)}</TableCell>
                  <TableCell>
                    {entry.status !== 'published' ? (
                      <span data-catalogue-reason>Ya está fuera de las búsquedas.</span>
                    ) : (
                      <AlertDialog
                        open={archiving === entry.id}
                        onOpenChange={(next) => {
                          // Closing mid-flight would hide a request that is still going to land.
                          if (busy !== null) return
                          setArchiving(next ? entry.id : null)
                        }}
                      >
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy !== null}
                          aria-label={`Archivar ${entry.name}`}
                          onClick={() => setArchiving(entry.id)}
                        >
                          {busy === `archive:${entry.id}` ? 'Archivando…' : 'Archivar'}
                        </Button>
                        <AlertDialogContent data-archive-entry-dialog>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {`¿Archivar ${catalogueKindLabel(entry.kind).toLowerCase()} «${entry.name}»?`}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Sale de las búsquedas; lo que ya la usaba sigue funcionando. El código
                              no se reutiliza y no se puede volver a publicar.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={busy !== null}>
                              Mantener en las búsquedas
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={busy !== null}
                              onClick={() => void onArchive(entry).then(() => setArchiving(null))}
                            >
                              {busy === `archive:${entry.id}` ? 'Archivando…' : 'Sí, archivar'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

const CHOICES: ReadonlyArray<{ value: EquipmentChoice; label: string }> = [
  { value: 'none', label: 'No lo usa' },
  { value: 'optional', label: 'Opcional' },
  { value: 'required', label: 'Lo necesita' },
]

/**
 * What one movement uses. The list is sent whole, so the editor shows every published
 * equipment with its choice rather than a picker that could leave something stale.
 */
function MovementEquipmentEditor({
  movement,
  available,
  draft,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  movement: GlobalCatalogueEntry
  available: GlobalCatalogueEquipment[]
  draft: Record<string, EquipmentChoice>
  busy: string | null
  onChange: (code: string, choice: EquipmentChoice) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <Card data-movement-equipment-editor>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {`Equipamiento de «${movement.name}»`}
        </CardTitle>
        <CardDescription>
          Lo que el movimiento necesita o puede usar. Una persona filtra los movimientos por esto,
          así que solo se nombra equipamiento publicado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {available.length === 0 ? (
          <p data-movement-equipment-none>
            Todavía no hay equipamiento publicado. Publícalo abajo y vuelve a editar el movimiento.
          </p>
        ) : (
          <FieldGroup>
            {available.map((item) => (
              <Field
                key={item.id}
                orientation="responsive"
                data-movement-equipment-choice={item.code}
              >
                <FieldLabel htmlFor={`movement-equipment-${item.code}`}>{item.name}</FieldLabel>
                <Select
                  items={CHOICES.map((choice) => ({ value: choice.value, label: choice.label }))}
                  value={draft[item.code] ?? 'none'}
                  onValueChange={(value) => {
                    const next = CHOICES.find((choice) => choice.value === value)
                    if (next) onChange(item.code, next.value)
                  }}
                >
                  <SelectTrigger id={`movement-equipment-${item.code}`} disabled={busy !== null}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHOICES.map((choice) => (
                      <SelectItem key={choice.value} value={choice.value}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </FieldGroup>
        )}
        <div data-form-actions>
          <Button
            type="button"
            disabled={busy !== null}
            onClick={onSave}
            data-movement-equipment-save
          >
            {busy === `movement-equipment:${movement.id}` ? 'Guardando…' : 'Guardar equipamiento'}
          </Button>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function EquipmentSection({
  entries,
  busy,
  onArchive,
  form,
}: {
  entries: GlobalCatalogueEquipment[]
  busy: string | null
  onArchive: (item: GlobalCatalogueEquipment) => Promise<void>
  form: ReactNode
}) {
  const [archiving, setArchiving] = useState<string | null>(null)

  return (
    <Card data-catalogue-section="equipment">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Equipamiento
        </CardTitle>
        <CardDescription>
          Con qué se puede hacer un movimiento: compatibilidad, no inventario. Las personas filtran
          los movimientos por esto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {form}

        {entries.length === 0 ? (
          <ScreenEmpty
            icon="training"
            title="Todavía no hay equipamiento publicado."
            data-catalogue-empty
          >
            Lo primero que publiques aparece aquí con su código, su estado y cuántos movimientos lo
            usan.
          </ScreenEmpty>
        ) : (
          <Table scrollAreaLabel="Equipamiento">
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>En uso</TableHead>
                <TableHead>Archivar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((item) => (
                <TableRow key={item.id} data-catalogue-equipment-entry data-status={item.status}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>
                    <code>{item.code}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={catalogueStatusTone(item.status)}>
                      {catalogueStatusLabel(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{equipmentInUseExplanation(item)}</TableCell>
                  <TableCell>
                    {item.status !== 'published' ? (
                      <span data-catalogue-reason>Ya está fuera de las búsquedas.</span>
                    ) : (
                      <AlertDialog
                        open={archiving === item.id}
                        onOpenChange={(next) => {
                          // Closing mid-flight would hide a request that is still going to land.
                          if (busy !== null) return
                          setArchiving(next ? item.id : null)
                        }}
                      >
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy !== null}
                          aria-label={`Archivar ${item.name}`}
                          onClick={() => setArchiving(item.id)}
                        >
                          {busy === `archive:${item.id}` ? 'Archivando…' : 'Archivar'}
                        </Button>
                        <AlertDialogContent data-archive-entry-dialog>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{`¿Archivar el equipamiento «${item.name}»?`}</AlertDialogTitle>
                            <AlertDialogDescription>
                              Sale de las búsquedas y de la lista de cada movimiento que lo usa. Se
                              puede volver a publicar con el mismo nombre, y entonces vuelve con
                              ellos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={busy !== null}>
                              Mantener en las búsquedas
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={busy !== null}
                              onClick={() => void onArchive(item).then(() => setArchiving(null))}
                            >
                              {busy === `archive:${item.id}` ? 'Archivando…' : 'Sí, archivar'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function readFailure(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return globalCatalogueMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return globalCatalogueMessage(error.code)
  return globalCatalogueMessage('upstream-unavailable')
}
