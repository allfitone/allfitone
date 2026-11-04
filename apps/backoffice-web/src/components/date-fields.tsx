'use client'

/**
 * The Backoffice's date and moment fields: the Design System's DatePicker and
 * TimePicker with their words in Spanish, over the text values the screens keep
 * (see `lib/date-fields.ts`). They replace the browser's `date` and
 * `datetime-local` controls, whose picker follows the operating system's language
 * and look instead of the Design System's.
 *
 * Every word is set here once, so the five fields that use them cannot drift.
 */

import { DatePicker } from '@allfitone/react/components/date-picker'
import { FieldLegend, FieldSet } from '@allfitone/react/components/field'
import { TimePicker } from '@allfitone/react/components/time-picker'
import { es } from 'date-fns/locale'
import { useState } from 'react'

import { dayOf, dayValue, momentValue, timeOf } from '@/lib/date-fields'

const DATE_WORDS = {
  locale: es,
  formatPattern: 'dd/MM/yyyy',
  formatHint: 'DD/MM/AAAA',
  formatLabel: 'Formato',
  errorMessage: 'Escribe una fecha válida en formato DD/MM/AAAA.',
  calendarLabel: 'Calendario',
  openCalendarLabel: 'Abrir calendario',
  clearLabel: 'Borrar fecha',
} as const

const TIME_WORDS = {
  formatHint: 'HH:MM',
  formatLabel: 'Formato',
  errorMessage: 'Escribe una hora válida en formato HH:MM, entre 00:00 y 23:59.',
  listLabel: 'Elige una hora',
  openListLabel: 'Abrir horas',
  clearLabel: 'Borrar hora',
} as const

type DayFieldProps = {
  id: string
  label: string
  /** `YYYY-MM-DD`, or empty. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function DayField({ id, label, value, onChange, disabled }: DayFieldProps) {
  return (
    <DatePicker
      {...DATE_WORDS}
      id={id}
      label={label}
      value={dayOf(value)}
      disabled={disabled}
      onValueChange={(day) => onChange(day ? dayValue(day) : '')}
    />
  )
}

type MomentFieldProps = {
  id: string
  legend: string
  /** `YYYY-MM-DDTHH:MM`, or empty. */
  value: string
  onChange: (value: string) => void
  /** The time a day takes when none is chosen, such as `23:59` for an upper bound. */
  defaultTime: string
  disabled?: boolean
}

export function MomentField({
  id,
  legend,
  value,
  onChange,
  defaultTime,
  disabled,
}: MomentFieldProps) {
  // A time chosen before its day has nowhere to live in the value; it waits here.
  const [pendingTime, setPendingTime] = useState<string>()
  const day = dayOf(value)
  const time = timeOf(value) ?? pendingTime

  return (
    <FieldSet data-moment-field>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <div data-moment-field-parts>
        <DatePicker
          {...DATE_WORDS}
          id={`${id}-day`}
          label="Fecha"
          value={day}
          disabled={disabled}
          onValueChange={(next) => onChange(momentValue(next, time ?? defaultTime))}
        />
        <TimePicker
          {...TIME_WORDS}
          id={`${id}-time`}
          label="Hora"
          value={time}
          disabled={disabled}
          onValueChange={(next) => {
            setPendingTime(next)
            if (day) onChange(momentValue(day, next ?? defaultTime))
          }}
        />
      </div>
    </FieldSet>
  )
}
