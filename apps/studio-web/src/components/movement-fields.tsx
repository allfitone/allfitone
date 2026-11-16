'use client'

/**
 * The fields of a gym's own movement, shared by creating and editing one.
 *
 * Equipment is not among them: Studio has no read of the equipment catalogue,
 * so there is nothing to choose a code from (see `movement-form.ts`). The
 * variant is chosen from the global library only, which is all
 * `catalog.valid_movement_variant` accepts.
 */

import { Button } from '@allfitone/react/components/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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
import { Textarea } from '@allfitone/react/components/textarea'
import { useState } from 'react'

import { MovementPicker } from './movement-picker'
import {
  RELATION_LABEL,
  type MovementFormDraft,
  type MovementFormErrors,
} from '@/lib/movement-form'
import type { MovementRelation } from '@/lib/studio-api'

const RELATIONS: MovementRelation[] = ['variant', 'regression', 'progression']
const RELATION_ITEMS = RELATIONS.map((relation) => ({
  value: relation,
  label: RELATION_LABEL[relation],
}))

export function MovementFields({
  draft,
  errors,
  disciplines,
  organizationId,
  locked = false,
  onChange,
}: {
  draft: MovementFormDraft
  errors: MovementFormErrors
  disciplines: ReadonlyArray<{ value: string; label: string }>
  organizationId: string
  /** A published version uses it: the discipline is fixed and the name nearly so. */
  locked?: boolean
  onChange: (patch: Partial<MovementFormDraft>) => void
}) {
  const [picking, setPicking] = useState(false)
  const variant = draft.variant

  return (
    <FieldGroup>
      <Field data-invalid={Boolean(errors.discipline)}>
        <FieldLabel htmlFor="movement-discipline-field">Disciplina</FieldLabel>
        <Select
          value={draft.disciplineCode || null}
          onValueChange={(value) => onChange({ disciplineCode: value ?? '', variant: null })}
          items={disciplines}
          disabled={locked}
        >
          <SelectTrigger
            id="movement-discipline-field"
            data-studio-select-trigger
            aria-invalid={Boolean(errors.discipline)}
          >
            <SelectValue placeholder="Elige una disciplina" />
          </SelectTrigger>
          <SelectContent align="start">
            {disciplines.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* HU-064 criterion 3: the list is what Allfit publishes, and nothing more. */}
        <FieldDescription>
          {locked
            ? 'Una versión publicada ya lo usa, así que la disciplina no cambia.'
            : 'Las disciplinas las publica Allfit, para que los datos sigan siendo comparables.'}
        </FieldDescription>
        {errors.discipline ? <FieldError>{errors.discipline}</FieldError> : null}
      </Field>

      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor="movement-name-field">Nombre</FieldLabel>
        <Input
          id="movement-name-field"
          maxLength={120}
          value={draft.name}
          aria-invalid={Boolean(errors.name)}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <FieldDescription>
          {locked
            ? 'Una versión publicada ya lo usa: solo admite cambios de mayúsculas o espacios. Para llamarlo distinto, crea otro movimiento y archiva este.'
            : 'Único en tu organización, sin contar mayúsculas ni espacios. Puede coincidir con uno del catálogo.'}
        </FieldDescription>
        {errors.name ? <FieldError>{errors.name}</FieldError> : null}
      </Field>

      <Field data-invalid={Boolean(errors.aliases)}>
        <FieldLabel htmlFor="movement-aliases-field">Otros nombres</FieldLabel>
        <Textarea
          id="movement-aliases-field"
          value={draft.aliasesText}
          aria-invalid={Boolean(errors.aliases)}
          onChange={(event) => onChange({ aliasesText: event.target.value })}
        />
        <FieldDescription>
          Opcional. Uno por línea, hasta 10. La búsqueda los encuentra igual que el nombre.
        </FieldDescription>
        {errors.aliases ? <FieldError>{errors.aliases}</FieldError> : null}
      </Field>

      {/* HU-064 criterion 2: a variant of a global movement, and only of one. */}
      <Field data-invalid={Boolean(errors.variant)}>
        <FieldTitle>Variante de un movimiento del catálogo</FieldTitle>
        {variant ? (
          <div data-movement-variant-fields>
            <p>{variant.movementName}</p>
            <Field>
              <FieldLabel htmlFor="movement-relation-field">Relación</FieldLabel>
              <Select
                value={variant.relation}
                onValueChange={(value) =>
                  onChange({ variant: { ...variant, relation: value ?? 'variant' } })
                }
                items={RELATION_ITEMS}
              >
                <SelectTrigger id="movement-relation-field" data-studio-select-trigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {RELATION_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="movement-variant-note-field">Nota de la variante</FieldLabel>
              <Input
                id="movement-variant-note-field"
                maxLength={200}
                value={variant.note}
                onChange={(event) =>
                  onChange({ variant: { ...variant, note: event.target.value } })
                }
              />
            </Field>
          </div>
        ) : null}
        <div data-movement-variant-actions>
          <Button
            type="button"
            variant="outline"
            disabled={!draft.disciplineCode}
            onClick={() => setPicking(true)}
          >
            {variant ? 'Cambiar el movimiento' : 'Elegir un movimiento del catálogo'}
          </Button>
          {variant ? (
            <Button type="button" variant="ghost" onClick={() => onChange({ variant: null })}>
              Quitar la variante
            </Button>
          ) : null}
        </div>
        <FieldDescription>
          {draft.disciplineCode
            ? 'Opcional. Solo de un movimiento del catálogo de Allfit, nunca de otro propio.'
            : 'Elige primero la disciplina.'}
        </FieldDescription>
        {errors.variant ? <FieldError>{errors.variant}</FieldError> : null}
      </Field>

      {draft.disciplineCode ? (
        <MovementPicker
          open={picking}
          onOpenChange={setPicking}
          organizationId={organizationId}
          disciplineCode={draft.disciplineCode}
          description="Del catálogo de Allfit, en la disciplina de este movimiento."
          onlyGlobal
          onPick={(movement) => {
            setPicking(false)
            onChange({
              variant: {
                movementId: movement.id,
                movementName: movement.name,
                relation: variant?.relation ?? 'variant',
                note: variant?.note ?? '',
              },
            })
          }}
        />
      ) : null}
    </FieldGroup>
  )
}
