'use client'

/**
 * `HU-BO-034` — the number Allfit sold a gym, inside the gym's file.
 *
 * **The occupancy is on screen while the number is being typed.** A quota is right or
 * wrong only against what the gym already has, so twenty is a sensible number for a
 * gym with twelve people and a mistake for one with three hundred. The warning appears
 * before the command, not after it.
 *
 * **No limit is a decision, an empty box is not.** The deal with no cap is its own
 * control, so nobody removes a gym's limit by clearing a field and pressing save.
 *
 * **Over its quota is not drawn as a failure.** It is what lowering the number does,
 * and it ends nothing: the panel says no new invitations until there is room, which is
 * the whole of the consequence.
 *
 * **Every number names its agreement (`HU-BO-027`).** The box starts empty each time,
 * so a new deal is never recorded under the previous one by leaving a field as it was.
 *
 * **A lost answer never decides twice.** The command is kept until an answer arrives,
 * so retrying after a network failure replays it instead of writing a second record of
 * a decision that was made once.
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
import { Checkbox } from '@allfitone/react/components/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { useRef, useState } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type BackofficeCommand,
  type OrganizationGuestQuota as Quota,
} from '@/lib/backoffice-api'
import {
  AGREEMENT_REQUIRED,
  LOWERING_NOTE,
  MAX_AGREEMENT_REFERENCE,
  UNLIMITED_NOTE,
  agreementSentence,
  draftWarning,
  lastChangeSentence,
  occupancySentence,
  parseAgreementReference,
  parseSeats,
  placesLeftSentence,
  quotaHistoryRows,
  quotaMessage,
  quotaOutcomeMessage,
  quotaSentence,
} from '@/lib/organization-guest-quota'
import { formatInstant } from '@/lib/platform-access'

export function OrganizationGuestQuotaPanel({ quota: initial }: { quota: Quota }) {
  const [quota, setQuota] = useState<Quota>(initial)
  const [seats, setSeats] = useState(initial.seats === null ? '' : String(initial.seats))
  const [unlimited, setUnlimited] = useState(initial.seats === null)
  // Empty on purpose: each decision names its agreement, never the last one by default.
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const pending = useRef<BackofficeCommand | null>(null)

  const draft = parseSeats(seats, unlimited)
  const warning = draftWarning(draft, quota)

  async function save() {
    if (!draft) {
      setFailure(quotaMessage('validation-failed'))
      return
    }
    const agreement = parseAgreementReference(reference)
    if (!agreement) {
      setFailure(AGREEMENT_REQUIRED)
      return
    }
    const command = pending.current ?? newBackofficeCommand()
    pending.current = command
    setBusy(true)
    setFailure(null)
    setOutcome(null)
    try {
      const saved = await backofficeApi.setOrganizationGuestQuota(
        quota.organization_id,
        { ...draft, agreement_reference: agreement },
        command,
      )
      pending.current = null
      setQuota(saved)
      setSeats(saved.seats === null ? '' : String(saved.seats))
      setUnlimited(saved.seats === null)
      setReference('')
      setOutcome(quotaOutcomeMessage(saved))
    } catch (error) {
      if (error instanceof BackofficeApiError && error.status === 401) {
        window.location.assign('/')
        return
      }
      setFailure(
        error instanceof BackofficeNetworkError
          ? quotaMessage('network-unavailable')
          : quotaMessage(error instanceof BackofficeApiError ? error.code : 'unknown'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card data-quota-panel>
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          Cupo de invitados
        </CardTitle>
        <CardDescription>
          Cuántas personas puede tener este gimnasio a la vez, contando relaciones vigentes e
          invitaciones sin responder. Lo fija Allfit One; el gimnasio no lo cambia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p data-quota-seats>
          {quotaSentence(quota)}{' '}
          {quota.over_quota ? <Badge variant="destructive">Por encima del cupo</Badge> : null}
        </p>
        <p data-quota-agreement>{agreementSentence(quota)}</p>
        <p data-quota-occupancy>{occupancySentence(quota)}</p>
        <p data-quota-left>{placesLeftSentence(quota)}</p>
        <p data-quota-last-change>
          {lastChangeSentence(quota)}
          {quota.last_change ? ` ${formatInstant(quota.last_change.at)}.` : ''}
        </p>
        {quota.history.length > 0 ? (
          <ul data-quota-history aria-label="Cambios del cupo">
            {quotaHistoryRows(quota).map((row) => (
              <li key={row.key} data-quota-change>
                {formatInstant(row.at)} · {row.who} · {row.change} · {row.agreement}
              </li>
            ))}
          </ul>
        ) : null}
        {quota.seats === null && quota.last_change === null ? (
          <p data-quota-unlimited-note>{UNLIMITED_NOTE}</p>
        ) : null}

        <FieldGroup data-quota-form>
          <Field>
            <FieldLabel htmlFor="quota-seats">Personas</FieldLabel>
            <Input
              id="quota-seats"
              name="seats"
              inputMode="numeric"
              autoComplete="off"
              value={seats}
              disabled={unlimited || busy}
              onChange={(event) => setSeats(event.target.value)}
            />
          </Field>
          <Field orientation="horizontal" data-quota-unlimited>
            <Checkbox
              id="quota-unlimited"
              checked={unlimited}
              disabled={busy}
              onCheckedChange={(checked) => setUnlimited(checked === true)}
            />
            <FieldLabel htmlFor="quota-unlimited">Sin límite</FieldLabel>
          </Field>
          <Field>
            <FieldLabel htmlFor="quota-agreement">Referencia del acuerdo</FieldLabel>
            <Input
              id="quota-agreement"
              name="agreement_reference"
              autoComplete="off"
              maxLength={MAX_AGREEMENT_REFERENCE}
              placeholder="CONTRATO-2026-014"
              value={reference}
              disabled={busy}
              aria-describedby="quota-agreement-help"
              onChange={(event) => setReference(event.target.value)}
            />
            <FieldDescription id="quota-agreement-help">
              El número o código del contrato con el gimnasio. Lo que Allfit One le cobra se factura
              por fuera, así que esta referencia es lo que une el cupo con el acuerdo.
            </FieldDescription>
          </Field>
          <div data-form-actions>
            <Button type="button" onClick={() => void save()} disabled={busy} data-quota-save>
              {busy ? 'Guardando…' : 'Fijar el cupo'}
            </Button>
          </div>
        </FieldGroup>

        <p data-quota-lowering-note>{LOWERING_NOTE}</p>

        {warning ? (
          <Alert live="polite" variant="warning" data-quota-warning>
            <AlertTitle>Queda por debajo de lo ocupado</AlertTitle>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        ) : null}

        {outcome ? (
          <Alert live="polite" variant="success" data-quota-outcome>
            <AlertTitle>Cupo fijado</AlertTitle>
            <AlertDescription>{outcome}</AlertDescription>
          </Alert>
        ) : null}

        {failure ? (
          <Alert live="assertive" variant="danger" data-quota-failure>
            <AlertTitle>No se pudo fijar</AlertTitle>
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
