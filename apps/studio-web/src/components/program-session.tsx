'use client'

/**
 * The two pieces of a program's grid that repeat: a session on its day, and
 * the form that puts one there.
 *
 * A session is a week, a day and one template version. The version is named
 * by number everywhere, because that is criterion 1 of `HU-STUDIO-041`: a
 * session is fixed to one exact version and never follows «the latest».
 *
 * Both open in place, over the cell they belong to, so the grid stays the
 * picture of the program while one cell of it changes. A session can also be
 * dragged to another day; its panel moves it too, for a keyboard and for a
 * touch screen, where nothing is dragged.
 *
 * Both are modal. They hold controls and float over sessions and buttons, so
 * a press that misses a control would land on whatever shows beside it; on a
 * phone that left a strip of a week's button a few pixels tall. A press
 * outside closes the panel and does nothing else.
 */

import { Badge } from '@allfitone/react/components/badge'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import { Field, FieldDescription, FieldLabel } from '@allfitone/react/components/field'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@allfitone/react/components/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { FoundationIcon } from '@allfitone/react/icons'
import Link from 'next/link'
import { useId, useState } from 'react'

import {
  DAY_OPTIONS,
  type ComposableTemplate,
  type ProgramEditorSession,
  type TemplateVersionChoice,
} from '@/lib/program-editor'

const DAY_ITEMS = DAY_OPTIONS.map((day) => ({ value: String(day), label: `Día ${day}` }))
const UNAVAILABLE = 'Una versión de plantilla que ya no está disponible'
// Stays on its side and moves along it until it fits, over the button if it has to.
const OVER_THE_BUTTON = { side: 'shift', align: 'shift', fallbackAxisSide: 'none' } as const
// The privacy control floats over the bottom corner: a panel ends above it, like the toasts.
const CLEAR_OF_THE_CORNER = { top: 12, right: 12, bottom: 84, left: 12 }

function weekItems(weeks: readonly number[]) {
  return weeks.map((week) => ({ value: String(week), label: `Semana ${week}` }))
}

export function ProgramSession({
  session,
  version,
  weeks,
  contentPath,
  open,
  onOpenChange,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onRemove,
}: {
  session: ProgramEditorSession
  version: TemplateVersionChoice | undefined
  weeks: readonly number[]
  contentPath: string
  open: boolean
  onOpenChange: (open: boolean) => void
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onMove: (to: { week?: number; day?: number }) => void
  onRemove: () => void
}) {
  const id = useId()
  const title = version?.templateTitle ?? UNAVAILABLE

  return (
    <div
      data-program-session
      data-dragging={dragging}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', title)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
    >
      <Popover modal open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger data-program-chip>
          <span data-program-chip-title>{title}</span>
          {version ? (
            <span data-program-chip-meta>
              Versión {version.versionNumber}
              {version.retired ? <Badge variant="outline">Retirada</Badge> : null}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={CLEAR_OF_THE_CORNER} data-program-panel>
          {/* The title is what names the panel to a screen reader. */}
          <PopoverHeader>
            <PopoverTitle>{title}</PopoverTitle>
            {version ? <PopoverDescription>{versionOption(version)}</PopoverDescription> : null}
          </PopoverHeader>
          <div data-program-panel-fields="pair">
            <Field>
              <FieldLabel htmlFor={`${id}-week`}>Semana</FieldLabel>
              <Select
                value={String(session.week)}
                onValueChange={(value) => onMove({ week: Number(value) })}
                items={weekItems(weeks)}
              >
                <SelectTrigger id={`${id}-week`} data-studio-select-trigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {weeks.map((week) => (
                    <SelectItem key={week} value={String(week)}>
                      Semana {week}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-day`}>Día</FieldLabel>
              <Select
                value={String(session.day)}
                onValueChange={(value) => onMove({ day: Number(value) })}
                items={DAY_ITEMS}
              >
                <SelectTrigger id={`${id}-day`} data-studio-select-trigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {DAY_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <PopoverFooter>
            {/* HU-STUDIO-045: the exact version this session is fixed to, read whole. */}
            {version ? (
              <Link
                href={`${contentPath}/templates/${version.templateId}/versions/${version.versionNumber}`}
                data-slot="button"
                data-variant="link"
                className={buttonVariants({ variant: 'link' })}
              >
                Ver la versión {version.versionNumber}
              </Link>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRemove}
              aria-label={`Quitar la sesión del día ${session.day} de la semana ${session.week}`}
            >
              Quitar
            </Button>
          </PopoverFooter>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * Adding a session. On a day the day is given; on the week's own button, which
 * is what a phone shows, it is one more thing to choose.
 */
export function AddSession({
  templates,
  hiddenTemplates,
  week,
  day,
  suggestedDay,
  remembered,
  open,
  onOpenChange,
  onAdd,
}: {
  templates: readonly ComposableTemplate[]
  /** Templates left out because nothing of theirs can be added yet. */
  hiddenTemplates: number
  week: number
  day?: number
  suggestedDay: number
  /** The template of the last session added, offered again. */
  remembered: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (session: { week: number; day: number; templateVersionId: string }) => void
}) {
  const nothingToAdd = templates.length === 0

  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      {day === undefined ? (
        <PopoverTrigger
          render={<Button type="button" variant="outline" size="sm" data-program-week-add />}
          disabled={nothingToAdd}
        >
          <FoundationIcon name="add" decorative />
          Agregar sesión
        </PopoverTrigger>
      ) : (
        <PopoverTrigger
          data-program-add
          disabled={nothingToAdd}
          aria-label={`Agregar una sesión el día ${day} de la semana ${week}`}
        >
          <FoundationIcon name="add" decorative />
        </PopoverTrigger>
      )}
      <PopoverContent
        align={day === undefined ? 'end' : 'start'}
        // A phone has no side with room for the whole form: it may cover its button.
        collisionAvoidance={day === undefined ? OVER_THE_BUTTON : undefined}
        collisionPadding={CLEAR_OF_THE_CORNER}
        data-program-panel
      >
        <PopoverHeader>
          <PopoverTitle>Agregar una sesión</PopoverTitle>
          <PopoverDescription>
            {day === undefined ? `Semana ${week}` : `Día ${day} de la semana ${week}`}
          </PopoverDescription>
        </PopoverHeader>
        <AddSessionForm
          templates={templates}
          hiddenTemplates={hiddenTemplates}
          day={day}
          suggestedDay={suggestedDay}
          remembered={remembered}
          onAdd={(chosen) => onAdd({ week, ...chosen })}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Mounted with the panel, so every opening starts from the same choice. */
function AddSessionForm({
  templates,
  hiddenTemplates,
  day,
  suggestedDay,
  remembered,
  onAdd,
}: {
  templates: readonly ComposableTemplate[]
  hiddenTemplates: number
  day: number | undefined
  suggestedDay: number
  remembered: string | null
  onAdd: (session: { day: number; templateVersionId: string }) => void
}) {
  const id = useId()
  // The one just used, or the only one there is: a week is often one template repeated.
  const [first] = templates
  const initial =
    templates.find((candidate) => candidate.id === remembered) ??
    (templates.length === 1 ? first : undefined)
  const [templateId, setTemplateId] = useState<string | null>(initial?.id ?? null)
  const [versionId, setVersionId] = useState<string | null>(newestUsable(initial))
  const [chosenDay, setChosenDay] = useState(day ?? suggestedDay)

  const template = templates.find((candidate) => candidate.id === templateId)
  const versions = template?.versions ?? []
  const templateItems = templates.map((entry) => ({ value: entry.id, label: entry.title }))
  const versionItems = versions.map((version) => ({
    value: version.id,
    label: versionOption(version),
  }))

  function chooseTemplate(next: string | null) {
    setTemplateId(next)
    // The newest version that can still be added, named rather than implied.
    setVersionId(newestUsable(templates.find((candidate) => candidate.id === next)))
  }

  return (
    <>
      <div data-program-panel-fields>
        <Field>
          <FieldLabel htmlFor={`${id}-template`}>Plantilla</FieldLabel>
          <Select value={templateId} onValueChange={chooseTemplate} items={templateItems}>
            <SelectTrigger id={`${id}-template`} data-studio-select-trigger>
              <SelectValue placeholder="Elige una plantilla" />
            </SelectTrigger>
            <SelectContent align="start">
              {templateItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-version`}>Versión</FieldLabel>
          <Select
            value={versionId}
            onValueChange={(value) => setVersionId(value)}
            items={versionItems}
            disabled={!template}
          >
            <SelectTrigger id={`${id}-version`} data-studio-select-trigger>
              <SelectValue placeholder="Elige primero la plantilla" />
            </SelectTrigger>
            <SelectContent align="start">
              {versions.map((version) => (
                <SelectItem key={version.id} value={version.id} disabled={version.retired}>
                  {versionOption(version)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {day === undefined ? (
          <Field>
            <FieldLabel htmlFor={`${id}-day`}>Día</FieldLabel>
            <Select
              value={String(chosenDay)}
              onValueChange={(value) => setChosenDay(Number(value))}
              items={DAY_ITEMS}
            >
              <SelectTrigger id={`${id}-day`} data-studio-select-trigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {DAY_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </div>
      {/* Criteria 1 and 2, said where the choice is made. */}
      <FieldDescription>
        La sesión queda fijada a la versión que elijas: si la plantilla publica otra, el programa no
        cambia solo.
        {hiddenTemplates > 0
          ? ` Solo aparecen plantillas con una versión publicada vigente, porque un borrador no se puede usar${hiddenLine(hiddenTemplates)}.`
          : ''}
      </FieldDescription>
      <PopoverFooter>
        <Button
          type="button"
          disabled={!versionId}
          onClick={() => {
            if (versionId) onAdd({ day: chosenDay, templateVersionId: versionId })
          }}
        >
          Agregar la sesión
        </Button>
      </PopoverFooter>
    </>
  )
}

function newestUsable(template: ComposableTemplate | undefined): string | null {
  return template?.versions.find((version) => !version.retired)?.id ?? null
}

function hiddenLine(count: number): string {
  return count === 1
    ? '; una plantilla no aparece por eso'
    : `; ${count} plantillas no aparecen por eso`
}

function versionOption(version: TemplateVersionChoice): string {
  const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(
    new Date(version.publishedAt),
  )
  return `Versión ${version.versionNumber} · ${date}${version.retired ? ' · retirada' : ''}`
}
