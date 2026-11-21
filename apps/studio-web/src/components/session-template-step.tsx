'use client'

/**
 * One step of a template draft.
 *
 * Closed, a step is one line: its place, its movement and what it asks for, so
 * a session of six fits a screen and reads whole. Open, it is the fields of its
 * target family and no other: the family comes from the activity type, so a
 * strength step never offers a distance and an interval never offers sets
 * (HU-STUDIO-037 criterion 3). Strength sets are a grid with one row per set,
 * the way a coach writes them down. Every value stays the text that was typed
 * until the editor builds the draft, which is where it is checked against what
 * the server accepts.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@allfitone/react/components/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@allfitone/react/components/dropdown-menu'
import { Field, FieldDescription, FieldLabel } from '@allfitone/react/components/field'
import { IconButton } from '@allfitone/react/components/icon-button'
import { Input } from '@allfitone/react/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { Textarea } from '@allfitone/react/components/textarea'
import { FoundationIcon } from '@allfitone/react/icons'
import { useState, type ReactNode } from 'react'

import { MovementPicker } from './movement-picker'
import {
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
import { stepSummary } from '@/lib/template-step-summary'

const SET_KINDS: SetKind[] = ['normal', 'warmup', 'to_failure', 'drop']
const SIDES: Side[] = ['not_applicable', 'bilateral', 'left', 'right']
const LOAD_UNITS: LoadUnit[] = ['kg', 'lb']

export function TemplateStep({
  step,
  position,
  count,
  movementName,
  problems,
  open,
  onOpenChange,
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
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  disciplineCode: string
  onChange: (step: EditorStep) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
  onMovementPicked: (movement: StudioMovement) => void
}) {
  const [picking, setPicking] = useState(false)
  const id = `step-${step.key}`
  const name = step.movementId ? (movementName ?? 'Cargando el movimiento…') : 'Sin movimiento'

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      data-template-step
      data-step-open={open ? 'true' : 'false'}
    >
      <div data-template-step-head>
        {/* The accordion pattern: the line that opens a step is its heading. */}
        <div role="heading" aria-level={2} data-template-step-heading>
          <CollapsibleTrigger data-template-step-toggle>
            <span data-template-step-number>{position}</span>
            <span data-template-step-name data-empty={step.movementId ? undefined : 'true'}>
              {name}
            </span>
            <span data-template-step-summary>{stepSummary(step.target)}</span>
            <FoundationIcon name="expand" decorative data-template-step-chevron />
          </CollapsibleTrigger>
        </div>
        {step.supersetGroup !== null ? (
          <Badge variant="outline">Superserie {step.supersetGroup}</Badge>
        ) : null}
        {problems.length > 0 ? <Badge variant="warning">Revisar</Badge> : null}
        <StepMenu
          position={position}
          count={count}
          hasMovement={step.movementId !== null}
          onPick={() => setPicking(true)}
          onClearMovement={() => onChange({ ...step, movementId: null })}
          onMove={onMove}
          onRemove={onRemove}
        />
      </div>

      <CollapsibleContent>
        <div data-template-step-body>
          <div data-template-step-main>
            {step.movementId ? null : (
              <div data-template-step-movement>
                <Button type="button" variant="outline" onClick={() => setPicking(true)}>
                  <FoundationIcon name="search" decorative />
                  Elegir un movimiento
                </Button>
              </div>
            )}

            <TargetFields
              id={id}
              target={step.target}
              onChange={(target) => onChange({ ...step, target })}
            />
          </div>

          {/* Beside the targets where there is room: the step stays one screen tall. */}
          <Field data-template-step-aside>
            <FieldLabel htmlFor={`${id}-notes`}>Notas</FieldLabel>
            <Textarea
              id={`${id}-notes`}
              maxLength={2000}
              value={step.notes}
              onChange={(event) => onChange({ ...step, notes: event.target.value })}
              data-template-step-notes
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
        </div>
      </CollapsibleContent>

      <MovementPicker
        open={picking}
        onOpenChange={setPicking}
        organizationId={organizationId}
        disciplineCode={disciplineCode}
        description="Del catálogo de Allfit y de los propios de tu organización, en la disciplina de esta plantilla."
        onPick={(movement) => {
          setPicking(false)
          onMovementPicked(movement)
        }}
      />
    </Collapsible>
  )
}

function StepMenu({
  position,
  count,
  hasMovement,
  onPick,
  onClearMovement,
  onMove,
  onRemove,
}: {
  position: number
  count: number
  hasMovement: boolean
  onPick: () => void
  onClearMovement: () => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Opciones del paso ${position}`}
          />
        }
      >
        <FoundationIcon name="more" decorative />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-template-step-menu>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onPick}>
            {hasMovement ? 'Cambiar el movimiento' : 'Elegir un movimiento'}
          </DropdownMenuItem>
          {hasMovement ? (
            <DropdownMenuItem onClick={onClearMovement}>Quitar el movimiento</DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={position === 1} onClick={() => onMove(-1)}>
            Subir
          </DropdownMenuItem>
          <DropdownMenuItem disabled={position === count} onClick={() => onMove(1)}>
            Bajar
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            Quitar el paso
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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

const KIND_OPTIONS = SET_KINDS.map((kind) => ({ value: kind, label: SET_KIND_LABEL[kind] }))

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
    <div data-template-sets>
      {/* Each field names itself for a reader; this row is the same names, once, for the eye. */}
      <div data-template-sets-head aria-hidden="true">
        <span>Serie</span>
        <span>Tipo</span>
        <span>Reps</span>
        <span>Carga ({target.loadUnit})</span>
        <span>RPE</span>
        <span />
      </div>
      <ol data-template-sets-rows aria-label="Series">
        {target.sets.map((set, index) => {
          const number = index + 1
          return (
            <li key={index} data-template-set aria-label={`Serie ${number}`}>
              <span data-template-set-number aria-hidden="true">
                {number}
              </span>
              <SetCell area="kind" caption="Tipo">
                <Select
                  value={set.kind}
                  onValueChange={(next) => {
                    const option = KIND_OPTIONS.find((candidate) => candidate.value === next)
                    if (option) changeSet(index, { kind: option.value })
                  }}
                  items={KIND_OPTIONS}
                >
                  <SelectTrigger
                    aria-label="Tipo de serie"
                    data-studio-select-trigger
                    data-template-set-kind
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {KIND_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SetCell>
              <SetCell area="reps" caption="Reps">
                <Input
                  id={`${id}-set-${index}-reps`}
                  aria-label="Repeticiones"
                  inputMode="numeric"
                  autoComplete="off"
                  value={set.kind === 'to_failure' ? '' : set.reps}
                  disabled={set.kind === 'to_failure'}
                  onChange={(event) => changeSet(index, { reps: event.target.value })}
                />
              </SetCell>
              <SetCell area="load" caption={`Carga (${target.loadUnit})`}>
                <Input
                  id={`${id}-set-${index}-load`}
                  aria-label={`Carga (${target.loadUnit})`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={set.load}
                  onChange={(event) => changeSet(index, { load: event.target.value })}
                />
              </SetCell>
              <SetCell area="rpe" caption="RPE">
                <Input
                  id={`${id}-set-${index}-rpe`}
                  aria-label="Esfuerzo (RPE)"
                  inputMode="decimal"
                  autoComplete="off"
                  value={set.rpe}
                  onChange={(event) => changeSet(index, { rpe: event.target.value })}
                />
              </SetCell>
              <span data-template-set-remove>
                {target.sets.length > 1 ? (
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar la serie ${number}`}
                    onClick={() =>
                      onChange({
                        ...target,
                        sets: target.sets.filter((_, current) => current !== index),
                      })
                    }
                  >
                    <FoundationIcon name="close" decorative />
                  </IconButton>
                ) : null}
              </span>
            </li>
          )
        })}
      </ol>
      <div data-template-sets-foot>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              ...target,
              // A new set copies the last one, which is how a coach writes «3 × 8».
              sets: [...target.sets, { ...(target.sets.at(-1) ?? EMPTY_SET) }],
            })
          }
        >
          <FoundationIcon name="add" decorative />
          Agregar serie
        </Button>
        <Field orientation="horizontal" data-template-inline-field>
          <FieldLabel htmlFor={`${id}-rest`}>Descanso (s)</FieldLabel>
          <Input
            id={`${id}-rest`}
            inputMode="numeric"
            autoComplete="off"
            value={target.rest}
            onChange={(event) => onChange({ ...target, rest: event.target.value })}
            data-template-short-input
          />
        </Field>
        <Field orientation="horizontal" data-template-inline-field>
          <FieldLabel htmlFor={`${id}-unit`}>Unidad</FieldLabel>
          <Select
            value={target.loadUnit}
            onValueChange={(next) => {
              const unit = LOAD_UNITS.find((candidate) => candidate === next)
              if (unit) onChange({ ...target, loadUnit: unit })
            }}
            items={LOAD_UNITS.map((unit) => ({ value: unit, label: unit }))}
          >
            <SelectTrigger id={`${id}-unit`} data-studio-select-trigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {LOAD_UNITS.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  )
}

const EMPTY_SET: EditorSet = { kind: 'normal', reps: '', load: '', rpe: '' }

/** One cell of a set. The caption is for a phone, where the column names are not drawn. */
function SetCell({
  area,
  caption,
  children,
}: {
  area: 'kind' | 'reps' | 'load' | 'rpe'
  caption: string
  children: ReactNode
}) {
  return (
    <span data-template-set-cell={area}>
      <span data-template-set-caption aria-hidden="true">
        {caption}
      </span>
      {children}
    </span>
  )
}

function NumberField({
  id,
  label,
  value,
  inputMode,
  onChange,
}: {
  id: string
  label: string
  value: string
  inputMode: 'numeric' | 'decimal'
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
