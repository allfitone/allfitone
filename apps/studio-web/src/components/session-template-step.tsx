'use client'

/**
 * One step of a template draft, and the dialog that picks its movement.
 *
 * The fields a step shows are its target family's and no other: the family
 * comes from the activity type, so a strength step never offers a distance and
 * an interval never offers sets (HU-STUDIO-037 criterion 3). Every value stays
 * the text that was typed until the editor builds the draft, which is where it
 * is checked against what the server accepts.
 */

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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { Spinner } from '@allfitone/react/components/spinner'
import { Textarea } from '@allfitone/react/components/textarea'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'

import {
  MOVEMENT_SEARCH_LIMIT,
  flattenMovementPages,
  movementEmptyMessage,
  movementScopeLabel,
  movementSearchTerm,
} from '@/lib/movement-search'
import {
  FAMILY_LABEL,
  SET_KIND_LABEL,
  SIDE_LABEL,
  type EditorSet,
  type EditorStep,
  type EditorTarget,
  type LoadUnit,
  type SetKind,
  type Side,
} from '@/lib/session-template-editor'
import type { StudioMovement } from '@/lib/studio-api'
import { organizationMovementsQueryOptions } from '@/lib/studio-query'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const SET_KINDS: SetKind[] = ['normal', 'warmup', 'to_failure', 'drop']
const SIDES: Side[] = ['not_applicable', 'bilateral', 'left', 'right']
const LOAD_UNITS: LoadUnit[] = ['kg', 'lb']

export function TemplateStepCard({
  step,
  position,
  count,
  movementName,
  problems,
  organizationId,
  disciplineCode,
  onChange,
  onMove,
  onRemove,
  onMovementPicked,
}: {
  step: EditorStep
  position: number
  count: number
  movementName: string | undefined
  problems: readonly string[]
  organizationId: string
  disciplineCode: string
  onChange: (step: EditorStep) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
  onMovementPicked: (movement: StudioMovement) => void
}) {
  const [picking, setPicking] = useState(false)
  const id = `step-${step.key}`
  const label = `Paso ${position}`

  return (
    <Card data-template-step aria-labelledby={`${id}-title`}>
      <CardHeader>
        <CardTitle id={`${id}-title`} role="heading" aria-level={2}>
          {label}
        </CardTitle>
        <CardDescription>
          {step.movementId ? (movementName ?? 'Cargando el movimiento…') : 'Sin movimiento'}
          {' · '}
          Objetivos de {FAMILY_LABEL[step.target.family]}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div data-template-step-actions>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={position === 1}
              onClick={() => onMove(-1)}
              aria-label={`Subir el ${label.toLowerCase()}`}
            >
              Subir
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={position === count}
              onClick={() => onMove(1)}
              aria-label={`Bajar el ${label.toLowerCase()}`}
            >
              Bajar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              aria-label={`Quitar el ${label.toLowerCase()}`}
            >
              Quitar
            </Button>
            {step.supersetGroup !== null ? (
              <Badge variant="outline">Superserie {step.supersetGroup}</Badge>
            ) : null}
          </div>

          {/* A title, not a label: a label pointed at the button would replace
              its name, and the reader would hear «Movimiento» for both. */}
          <Field>
            <FieldTitle>Movimiento</FieldTitle>
            <div data-template-step-actions>
              <Button type="button" variant="outline" onClick={() => setPicking(true)}>
                {step.movementId ? 'Cambiar el movimiento' : 'Elegir un movimiento'}
              </Button>
              {step.movementId ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onChange({ ...step, movementId: null })}
                >
                  Quitar el movimiento
                </Button>
              ) : null}
            </div>
            <FieldDescription>
              Del catálogo de Allfit o de los propios, en la disciplina de la plantilla.
            </FieldDescription>
          </Field>

          <TargetFields
            id={id}
            target={step.target}
            onChange={(target) => onChange({ ...step, target })}
          />

          <Field>
            <FieldLabel htmlFor={`${id}-notes`}>Notas</FieldLabel>
            <Textarea
              id={`${id}-notes`}
              maxLength={2000}
              value={step.notes}
              onChange={(event) => onChange({ ...step, notes: event.target.value })}
            />
            <FieldDescription>Opcional. Lo que la persona lee al hacer este paso.</FieldDescription>
          </Field>

          {problems.length > 0 ? (
            <Alert variant="warning" data-template-step-problems>
              <AlertTitle>Este paso todavía no se puede guardar</AlertTitle>
              <AlertDescription>
                <ul>
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </CardContent>

      <MovementPicker
        open={picking}
        onOpenChange={setPicking}
        organizationId={organizationId}
        disciplineCode={disciplineCode}
        onPick={(movement) => {
          setPicking(false)
          onMovementPicked(movement)
        }}
      />
    </Card>
  )
}

function TargetFields({
  id,
  target,
  onChange,
}: {
  id: string
  target: EditorTarget
  onChange: (target: EditorTarget) => void
}) {
  if (target.family === 'strength') {
    return <StrengthFields id={id} target={target} onChange={onChange} />
  }
  if (target.family === 'endurance') {
    return (
      <div data-template-target-fields>
        <NumberField
          id={`${id}-distance`}
          label="Distancia (m)"
          inputMode="decimal"
          value={target.distance}
          onChange={(distance) => onChange({ ...target, distance })}
        />
        <NumberField
          id={`${id}-minutes`}
          label="Duración (min)"
          inputMode="decimal"
          value={target.minutes}
          onChange={(minutes) => onChange({ ...target, minutes })}
        />
      </div>
    )
  }
  if (target.family === 'interval') {
    return (
      <div data-template-target-fields>
        <NumberField
          id={`${id}-rounds`}
          label="Rondas"
          inputMode="numeric"
          value={target.rounds}
          onChange={(rounds) => onChange({ ...target, rounds })}
        />
        <NumberField
          id={`${id}-work`}
          label="Trabajo (s)"
          inputMode="decimal"
          value={target.work}
          onChange={(work) => onChange({ ...target, work })}
        />
        <NumberField
          id={`${id}-rest`}
          label="Descanso (s)"
          inputMode="decimal"
          value={target.rest}
          onChange={(rest) => onChange({ ...target, rest })}
        />
        <NumberField
          id={`${id}-rpe`}
          label="Esfuerzo (RPE)"
          inputMode="decimal"
          value={target.rpe}
          onChange={(rpe) => onChange({ ...target, rpe })}
        />
      </div>
    )
  }
  return (
    <div data-template-target-fields>
      <NumberField
        id={`${id}-hold`}
        label="Sostener (s)"
        inputMode="decimal"
        value={target.hold}
        onChange={(hold) => onChange({ ...target, hold })}
      />
      <NumberField
        id={`${id}-reps`}
        label="Repeticiones"
        inputMode="numeric"
        value={target.reps}
        onChange={(reps) => onChange({ ...target, reps })}
      />
      <ChoiceField
        id={`${id}-side`}
        label="Lado"
        value={target.side}
        options={SIDES.map((side) => ({ value: side, label: SIDE_LABEL[side] }))}
        onChange={(side) => onChange({ ...target, side })}
      />
    </div>
  )
}

function StrengthFields({
  id,
  target,
  onChange,
}: {
  id: string
  target: Extract<EditorTarget, { family: 'strength' }>
  onChange: (target: EditorTarget) => void
}) {
  function changeSet(index: number, patch: Partial<EditorSet>) {
    onChange({
      ...target,
      sets: target.sets.map((set, current) => (current === index ? { ...set, ...patch } : set)),
    })
  }

  return (
    <>
      {target.sets.map((set, index) => (
        <FieldSet key={index} data-template-set>
          <FieldLegend variant="label">Serie {index + 1}</FieldLegend>
          <div data-template-target-fields>
            <ChoiceField
              id={`${id}-set-${index}-kind`}
              label="Tipo de serie"
              value={set.kind}
              options={SET_KINDS.map((kind) => ({ value: kind, label: SET_KIND_LABEL[kind] }))}
              onChange={(kind) => changeSet(index, { kind })}
            />
            <NumberField
              id={`${id}-set-${index}-reps`}
              label="Repeticiones"
              inputMode="numeric"
              value={set.kind === 'to_failure' ? '' : set.reps}
              disabled={set.kind === 'to_failure'}
              onChange={(reps) => changeSet(index, { reps })}
            />
            <NumberField
              id={`${id}-set-${index}-load`}
              label={`Carga (${target.loadUnit})`}
              inputMode="decimal"
              value={set.load}
              onChange={(load) => changeSet(index, { load })}
            />
            <NumberField
              id={`${id}-set-${index}-rpe`}
              label="Esfuerzo (RPE)"
              inputMode="decimal"
              value={set.rpe}
              onChange={(rpe) => changeSet(index, { rpe })}
            />
          </div>
          {target.sets.length > 1 ? (
            <div data-template-step-actions>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...target,
                    sets: target.sets.filter((_, current) => current !== index),
                  })
                }
              >
                Quitar la serie {index + 1}
              </Button>
            </div>
          ) : null}
        </FieldSet>
      ))}
      <div data-template-step-actions>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ...target,
              // A new set copies the last one, which is how a coach writes «3 × 8».
              sets: [...target.sets, { ...(target.sets.at(-1) ?? EMPTY_SET) }],
            })
          }
        >
          Agregar una serie
        </Button>
      </div>
      <div data-template-target-fields>
        <ChoiceField
          id={`${id}-unit`}
          label="Unidad de carga"
          value={target.loadUnit}
          options={LOAD_UNITS.map((unit) => ({ value: unit, label: unit }))}
          onChange={(loadUnit) => onChange({ ...target, loadUnit })}
        />
        <NumberField
          id={`${id}-rest`}
          label="Descanso entre series (s)"
          inputMode="numeric"
          value={target.rest}
          onChange={(rest) => onChange({ ...target, rest })}
        />
      </div>
    </>
  )
}

const EMPTY_SET: EditorSet = { kind: 'normal', reps: '', load: '', rpe: '' }

function NumberField({
  id,
  label,
  value,
  inputMode,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  inputMode: 'numeric' | 'decimal'
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode={inputMode}
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

function ChoiceField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next)
          if (option) onChange(option.value)
        }}
        items={options}
      >
        <SelectTrigger id={id} data-studio-select-trigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

const PICKER_PAGE_SIZE = 25
const PICKER_SETTLE_MS = 300

/**
 * The movement search of `HU-STUDIO-067`, held to the template's discipline:
 * the server refuses a step whose movement is of another one, so offering it
 * would only produce a refusal. Archived movements are left out, because
 * archiving is precisely «not for new content».
 */
function MovementPicker({
  open,
  onOpenChange,
  organizationId,
  disciplineCode,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  disciplineCode: string
  onPick: (movement: StudioMovement) => void
}) {
  const [searchBox, setSearchBox] = useState('')
  const settledBox = useDebouncedValue(searchBox, PICKER_SETTLE_MS)
  const filters = {
    term: movementSearchTerm(settledBox),
    disciplineCode,
    includeArchived: false,
  }
  const query = useInfiniteQuery({
    ...organizationMovementsQueryOptions(organizationId, filters, PICKER_PAGE_SIZE),
    enabled: open,
  })
  const movements = flattenMovementPages(query.data)
  const empty = movementEmptyMessage(filters)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-movement-picker>
        <DialogHeader>
          <DialogTitle>Elegir un movimiento</DialogTitle>
          <DialogDescription>
            Del catálogo de Allfit y de los propios de tu organización, en la disciplina de esta
            plantilla.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="movement-picker-search">Buscar</FieldLabel>
          <Input
            id="movement-picker-search"
            type="search"
            autoComplete="off"
            maxLength={MOVEMENT_SEARCH_LIMIT}
            placeholder="Nombre u otro nombre"
            value={searchBox}
            onChange={(event) => setSearchBox(event.target.value)}
          />
        </Field>

        {query.isPending ? (
          <div data-content-catalog-state>
            <Spinner label="Buscando movimientos" />
            <p>Buscando movimientos…</p>
          </div>
        ) : null}

        {query.isError ? (
          <FieldError>No pudimos buscar los movimientos. Cierra y vuelve a intentarlo.</FieldError>
        ) : null}

        {query.isSuccess && movements.length === 0 ? (
          <p data-movement-picker-empty>
            <b>{empty.title}.</b> {empty.description}
          </p>
        ) : null}

        {movements.length > 0 ? (
          <ul data-movement-picker-results aria-label="Movimientos para elegir">
            {movements.map((movement) => (
              <li key={movement.id}>
                <Button type="button" variant="outline" onClick={() => onPick(movement)}>
                  {movement.name}
                </Button>
                <Badge variant={movement.scope === 'global' ? 'secondary' : 'outline'}>
                  {movementScopeLabel(movement.scope)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          {query.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
            </Button>
          ) : null}
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
