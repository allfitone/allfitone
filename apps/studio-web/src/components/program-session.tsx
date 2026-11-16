'use client'

/**
 * The two pieces of a program draft that repeat: a session already in it, and
 * the card that adds one.
 *
 * A session is a week, a day and one template version. The version is named
 * by number everywhere, because that is criterion 1 of `HU-STUDIO-041`: a
 * session is fixed to one exact version and never follows «the latest».
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import Link from 'next/link'
import { useState } from 'react'

import {
  DAY_OPTIONS,
  type ComposableTemplate,
  type ProgramEditorSession,
  type TemplateVersionChoice,
} from '@/lib/program-editor'

const DAY_ITEMS = DAY_OPTIONS.map((day) => ({ value: String(day), label: `Día ${day}` }))

function weekItems(weeks: readonly number[]) {
  return weeks.map((week) => ({ value: String(week), label: `Semana ${week}` }))
}

export function versionLabel(version: TemplateVersionChoice): string {
  return `${version.templateTitle} · versión ${version.versionNumber}`
}

export function ProgramSessionRow({
  session,
  version,
  weeks,
  contentPath,
  onMove,
  onRemove,
}: {
  session: ProgramEditorSession
  version: TemplateVersionChoice | undefined
  weeks: readonly number[]
  contentPath: string
  onMove: (to: { week?: number; day?: number }) => void
  onRemove: () => void
}) {
  const id = `session-${session.key}`
  const name = version
    ? versionLabel(version)
    : 'Una versión de plantilla que ya no está disponible'
  return (
    <li data-program-session aria-labelledby={`${id}-name`}>
      <p id={`${id}-name`}>
        <strong>Día {session.day}</strong> · {name}{' '}
        {version?.retired ? <Badge variant="outline">Retirada</Badge> : null}
      </p>
      <div data-program-session-fields>
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
      <div data-program-session-actions>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRemove}
          aria-label={`Quitar la sesión del día ${session.day} de la semana ${session.week}`}
        >
          Quitar
        </Button>
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
      </div>
    </li>
  )
}

/**
 * Adding a session. Criterion 2 is what this card leaves out: a template with
 * nothing published is not offered, because a draft has no version to name.
 * A retired version is listed but cannot be chosen, because the server refuses
 * a new reference to one.
 */
export function AddSessionCard({
  templates,
  hiddenTemplates,
  weeks,
  suggested,
  onAdd,
}: {
  templates: readonly ComposableTemplate[]
  /** Templates left out because nothing of theirs can be added yet. */
  hiddenTemplates: number
  weeks: readonly number[]
  suggested: { week: number; day: number }
  onAdd: (session: { week: number; day: number; templateVersionId: string }) => void
}) {
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [versionId, setVersionId] = useState<string | null>(null)
  // Null follows the suggestion, which moves on after every session added.
  const [week, setWeek] = useState<number | null>(null)
  const [day, setDay] = useState<number | null>(null)

  const template = templates.find((candidate) => candidate.id === templateId)
  const versions = template?.versions ?? []
  const chosenWeek = week ?? suggested.week
  const chosenDay = day ?? suggested.day
  const templateItems = templates.map((entry) => ({ value: entry.id, label: entry.title }))
  const versionItems = versions.map((version) => ({
    value: version.id,
    label: versionOption(version),
  }))

  function chooseTemplate(next: string | null) {
    setTemplateId(next)
    // The newest version that can still be added, named rather than implied.
    const chosen = templates.find((candidate) => candidate.id === next)
    setVersionId(chosen?.versions.find((version) => !version.retired)?.id ?? null)
  }

  function add() {
    if (!versionId) return
    onAdd({ week: chosenWeek, day: chosenDay, templateVersionId: versionId })
    setWeek(null)
    setDay(null)
  }

  return (
    <Card data-program-add-session>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Agregar una sesión
        </CardTitle>
        <CardDescription>
          El día 1 es el primer día del programa para quien lo recibe, no un día de la semana.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <Alert variant="warning" data-program-no-templates>
            <AlertTitle>Todavía no hay versiones de plantilla que usar</AlertTitle>
            <AlertDescription>
              Un programa se compone de versiones publicadas de plantillas, y ninguna plantilla
              tiene una vigente. Publica una plantilla y vuelve aquí.
            </AlertDescription>
          </Alert>
        ) : (
          <FieldGroup>
            <div data-program-session-fields>
              <Field>
                <FieldLabel htmlFor="add-session-template">Plantilla</FieldLabel>
                <Select value={templateId} onValueChange={chooseTemplate} items={templateItems}>
                  <SelectTrigger id="add-session-template" data-studio-select-trigger>
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
                <FieldLabel htmlFor="add-session-version">Versión</FieldLabel>
                <Select
                  value={versionId}
                  onValueChange={(value) => setVersionId(value)}
                  items={versionItems}
                  disabled={!template}
                >
                  <SelectTrigger id="add-session-version" data-studio-select-trigger>
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
              <Field>
                <FieldLabel htmlFor="add-session-week">Semana</FieldLabel>
                <Select
                  value={String(chosenWeek)}
                  onValueChange={(value) => setWeek(Number(value))}
                  items={weekItems(weeks)}
                >
                  <SelectTrigger id="add-session-week" data-studio-select-trigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {weeks.map((entry) => (
                      <SelectItem key={entry} value={String(entry)}>
                        Semana {entry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="add-session-day">Día</FieldLabel>
                <Select
                  value={String(chosenDay)}
                  onValueChange={(value) => setDay(Number(value))}
                  items={DAY_ITEMS}
                >
                  <SelectTrigger id="add-session-day" data-studio-select-trigger>
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
            {/* Criteria 1 and 2, said where the choice is made. */}
            <FieldDescription>
              La sesión queda fijada a la versión que elijas: si la plantilla publica otra, el
              programa no cambia solo. Solo aparecen plantillas con una versión publicada vigente,
              porque un borrador no se puede usar{hiddenLine(hiddenTemplates)}.
            </FieldDescription>
            <div data-program-session-actions>
              <Button type="button" variant="outline" disabled={!versionId} onClick={add}>
                Agregar la sesión
              </Button>
            </div>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  )
}

function hiddenLine(count: number): string {
  if (count === 0) return ''
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
