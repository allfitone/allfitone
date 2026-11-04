'use client'

/**
 * `HU-BO-005` c1 and c5, `HU-BO-020` c3 — who the attention panel's billing count is.
 *
 * **The case comes first.** The list names payers, so nothing is read until a case
 * reference is written, and the server records the read against each person listed.
 * The case stays in the address, so a row opens the person's payments under the same
 * case and coming back keeps it.
 *
 * **Most urgent first, as the server ordered it.** Suspended, then in grace, then the
 * failed charges. The screen does not reorder or filter what it is given.
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  type SupportBillingFollowUp,
} from '@/lib/backoffice-api'
import {
  FOLLOW_UP_PAGE,
  followUpDetail,
  followUpHref,
  followUpMessage,
  followUpStateLabel,
  followUpSummary,
  followUpTone,
} from '@/lib/billing-follow-up'
import { isRefusal } from '@/lib/screen-state'
import { isValidCaseReference } from '@/lib/support-metadata'

import { ScreenEmpty, ScreenFailure, ScreenLoading } from './screen-state'

type LoadState = 'idle' | 'loading' | 'ready' | 'failed'

export function BillingFollowUp() {
  const router = useRouter()
  const parameters = useSearchParams()
  const fromAddress = parameters.get('case_reference') ?? ''
  const traceable = isValidCaseReference(fromAddress)
  const [caseReference, setCaseReference] = useState(fromAddress)
  const [issue, setIssue] = useState(false)
  const [state, setState] = useState<LoadState>(traceable ? 'loading' : 'idle')
  const [followUp, setFollowUp] = useState<SupportBillingFollowUp | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!traceable) return
    const controller = new AbortController()
    setState('loading')
    void (async () => {
      try {
        setFollowUp(
          await backofficeApi.billingFollowUp(fromAddress, FOLLOW_UP_PAGE, controller.signal),
        )
        setState('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof BackofficeApiError && error.status === 401) {
          window.location.assign('/')
          return
        }
        setRefused(isRefusal(error))
        setFailure(
          error instanceof BackofficeNetworkError
            ? followUpMessage('network-unavailable')
            : followUpMessage(error instanceof BackofficeApiError ? error.code : 'unknown'),
        )
        setState('failed')
      }
    })()
    return () => controller.abort()
  }, [fromAddress, traceable, reload])

  function submit(event: FormEvent) {
    event.preventDefault()
    const reference = caseReference.trim()
    if (!isValidCaseReference(reference)) {
      setIssue(true)
      return
    }
    setIssue(false)
    // The case lives in the address, so a person's payments and the way back keep it.
    if (reference === fromAddress) setReload((value) => value + 1)
    else router.replace(`/people/billing?case_reference=${encodeURIComponent(reference)}`)
  }

  return (
    <div data-billing-follow-up>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Cobros por seguir
          </CardTitle>
          <CardDescription>
            Suscripciones a Allfit One suspendidas o en gracia, y cobros que fallaron en los últimos
            30 días. Nombra a quien paga, así que pide el caso y queda registrado contra cada
            persona de la lista.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} data-backoffice-form data-billing-follow-up-form noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="billing-case">Referencia del caso</FieldLabel>
                <Input
                  id="billing-case"
                  value={caseReference}
                  onChange={(event) => setCaseReference(event.target.value)}
                  placeholder="CASE-2026-001"
                  autoComplete="off"
                  disabled={state === 'loading'}
                />
                {issue ? <FieldError>{followUpMessage('invalid-request')}</FieldError> : null}
              </Field>
            </FieldGroup>
            <div data-form-actions>
              <Button type="submit" disabled={state === 'loading'}>
                Ver la lista
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {state === 'loading' ? <ScreenLoading /> : null}

      {state === 'failed' ? (
        <ScreenFailure
          refused={refused}
          duties={['view_billing_metadata']}
          title="No se pudo leer la lista"
          message={failure ?? followUpMessage('upstream-unavailable')}
          onRetry={() => setReload((value) => value + 1)}
        />
      ) : null}

      {state === 'ready' && followUp ? (
        <Card data-billing-follow-up-list>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              {`Caso ${fromAddress}`}
            </CardTitle>
            <CardDescription data-billing-follow-up-summary>
              {followUpSummary(followUp)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {followUp.items.length === 0 ? (
              <ScreenEmpty icon="business" title="Nadie por seguir." data-billing-follow-up-empty>
                Cuando una suscripción se suspenda, entre en gracia o un cobro falle, aparece aquí.
              </ScreenEmpty>
            ) : (
              <Table scrollAreaLabel="Cobros por seguir">
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Suscripción</TableHead>
                    <TableHead>Qué pasó</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {followUp.items.map((item) => (
                    <TableRow
                      key={item.person_id}
                      data-billing-follow-up-row
                      data-status={item.subscription_status ?? 'none'}
                    >
                      <TableCell>
                        <Link
                          href={followUpHref(item, fromAddress)}
                          data-billing-follow-up-person
                          aria-label={`Abrir los pagos de ${item.person_id}`}
                        >
                          <code>{item.person_id.slice(0, 8)}</code>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={followUpTone(item)}>{followUpStateLabel(item)}</Badge>
                        {item.plan_name ? ` ${item.plan_name}` : null}
                      </TableCell>
                      <TableCell data-billing-follow-up-detail>{followUpDetail(item)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {state === 'idle' ? (
        <Alert live="off" variant="info" data-billing-follow-up-idle>
          <AlertTitle>Primero el caso</AlertTitle>
          <AlertDescription>
            Escribe la referencia del caso que justifica revisar los cobros. La lista no se lee sin
            ella.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
