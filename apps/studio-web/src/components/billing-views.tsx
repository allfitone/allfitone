'use client'

/**
 * What the screens of Cobros share: the badge that says where a plan stands,
 * the trail that leads back from a plan, and the four things a price asks.
 */

import { Badge } from '@allfitone/react/components/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@allfitone/react/components/breadcrumb'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { RadioGroup, RadioGroupItem } from '@allfitone/react/components/radio-group'
import Link from 'next/link'
import { useId } from 'react'

import { billingPath } from '@/lib/billing-navigation'
import { planState, planStateLabel, type PlanState } from '@/lib/plan-catalog'
import { publishPreview, type PublishDraft } from '@/lib/plan-publish'
import type { OrganizationPlan } from '@/lib/studio-api'

const STATE_VARIANT: Record<PlanState, 'success' | 'secondary' | 'outline'> = {
  on_sale: 'success',
  draft: 'secondary',
  off_sale: 'outline',
}

/** `HU-STUDIO-077` criterion 1: a draft, a plan on sale and one off sale, told apart. */
export function PlanStateBadge({ plan }: { plan: OrganizationPlan }) {
  const state = planState(plan)
  return (
    <Badge variant={STATE_VARIANT[state]} data-plan-state={state}>
      {planStateLabel(state)}
    </Badge>
  )
}

/** Where the reader is and the way back: Cobros, its plans, and the plan's name. */
export function BillingTrail({
  organizationId,
  current,
}: {
  organizationId: string
  current: string
}) {
  return (
    <Breadcrumb aria-label="Ruta">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href={billingPath(organizationId)} />} data-editor-crumb>
            Cobros
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink
            render={<Link href={billingPath(organizationId, 'plans')} />}
            data-editor-crumb
          >
            Planes
          </BreadcrumbLink>
        </BreadcrumbItem>
        {/* On a phone the name is the title right under the trail, so it is said once. */}
        <BreadcrumbSeparator data-editor-crumb-current />
        <BreadcrumbItem data-editor-crumb-current>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/**
 * The four things a price takes, and nothing else (`HU-STUDIO-075` criterion
 * 1). The currency is said rather than asked: it is pesos alone.
 */
export function PlanPriceFields({
  draft,
  amountProblem,
  onChange,
}: {
  draft: PublishDraft
  amountProblem: string | undefined
  onChange: (patch: Partial<PublishDraft>) => void
}) {
  const id = useId()
  return (
    <>
      <Field data-invalid={Boolean(amountProblem)}>
        <FieldLabel htmlFor={`${id}-amount`}>Precio en pesos colombianos (COP)</FieldLabel>
        <Input
          id={`${id}-amount`}
          inputMode="numeric"
          autoComplete="off"
          value={draft.amount}
          aria-invalid={Boolean(amountProblem)}
          onChange={(event) => onChange({ amount: event.target.value })}
        />
        <FieldDescription>Pesos enteros, sin centavos.</FieldDescription>
        {amountProblem ? <FieldError>{amountProblem}</FieldError> : null}
      </Field>

      <div data-plan-price-choices>
        <FieldSet>
          <FieldLegend variant="label">Cobro</FieldLegend>
          <RadioGroup
            value={draft.period}
            aria-label="Cobro"
            onValueChange={(value) => {
              if (value === 'month' || value === 'year') onChange({ period: value })
            }}
          >
            <Field orientation="horizontal">
              <RadioGroupItem id={`${id}-month`} value="month" />
              <FieldLabel htmlFor={`${id}-month`}>Mensual</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem id={`${id}-year`} value="year" />
              <FieldLabel htmlFor={`${id}-year`}>Anual</FieldLabel>
            </Field>
          </RadioGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Modalidad</FieldLegend>
          <RadioGroup
            value={draft.delivery}
            aria-label="Modalidad"
            onValueChange={(value) => {
              if (value === 'in_person' || value === 'remote') onChange({ delivery: value })
            }}
          >
            <Field orientation="horizontal">
              <RadioGroupItem id={`${id}-in-person`} value="in_person" />
              <FieldLabel htmlFor={`${id}-in-person`}>Presencial</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem id={`${id}-remote`} value="remote" />
              <FieldLabel htmlFor={`${id}-remote`}>Remoto</FieldLabel>
            </Field>
          </RadioGroup>
        </FieldSet>
      </div>
    </>
  )
}

/**
 * Said before the click and as the form is filled: the price read back as it
 * will stand, because it is never edited afterwards, and what publishing does.
 */
export function PublishConsequences({
  draft,
  lines,
}: {
  draft: PublishDraft
  lines: readonly string[]
}) {
  const id = useId()
  return (
    <>
      {/* Always there, empty until the amount is one, so the dialog does not jump. */}
      <p aria-live="polite" data-plan-price-preview>
        {publishPreview(draft)}
      </p>
      <section aria-labelledby={id} data-billing-consequence="happens">
        <h3 id={id}>Qué pasa al publicarlo</h3>
        <ul>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </>
  )
}
