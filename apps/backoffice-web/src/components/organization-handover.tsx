'use client'

/**
 * `HU-BO-014` and `HU-BO-015` — where a handover stands, and the only two things
 * Allfit may do while it waits. It is the «Entrega» tab of the gym's file, which
 * already names the gym and leads back to the directory.
 *
 * **Waiting is not done.** The badge and the sentence say whether the owner has not
 * answered, let the invitation lapse, rejected it, accepted it, or whether the
 * creation was cancelled. Only the first three allow any action.
 *
 * **Neither action changes the address.** Resending goes to the same email, and the
 * toast says whether the original invitation was sent again or replaced.
 * Cancelling asks once more before it happens, because it cannot be undone.
 *
 * **A lost race is re-read, not guessed.** If the owner accepted or someone else
 * cancelled meanwhile, the command is refused and the panel reads the handover
 * again rather than showing a state it no longer has. Whatever it learns about the
 * gym's state is handed to the file, so the header never contradicts the tab.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@allfitone/react/components/card'
import { Field, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
import { toast } from '@allfitone/react/components/sonner'
import { useCallback, useEffect, useState } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type OrganizationHandover as Handover,
} from '@/lib/backoffice-api'
import {
  CANCELLED_NOTICE,
  canActOn,
  cancelledBySentence,
  createdBySentence,
  handoverMessage,
  handoverStage,
  siteLine,
  resendNotice,
  responsibleSentence,
  stageLabel,
  stageSentence,
  stageTone,
} from '@/lib/organization-handover'
import { formatInstant } from '@/lib/platform-access'
import { isRefusal } from '@/lib/screen-state'

import { ConfirmAction } from './confirm-action'
import { ScreenFailure, ScreenLoading } from './screen-state'

type LoadState = 'loading' | 'ready' | 'failed'

/** The part of a handover that is also the gym's own state, for the file to follow. */
export type HandoverLifecycle = Pick<Handover, 'status' | 'claimed_at' | 'cancelled_at'>

export function OrganizationHandoverPanel({
  organizationId,
  onLifecycle,
  onShowQuota,
}: {
  organizationId: string
  onLifecycle: (lifecycle: HandoverLifecycle) => void
  onShowQuota: () => void
}) {
  const [state, setState] = useState<LoadState>('loading')
  const [handover, setHandover] = useState<Handover | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  // Only what failed stays on the page; what worked pops up as a toast.
  const [notice, setNotice] = useState<string | null>(null)

  const accept = useCallback(
    (next: Handover) => {
      setHandover(next)
      setNow(Date.now())
      onLifecycle({
        status: next.status,
        claimed_at: next.claimed_at,
        cancelled_at: next.cancelled_at,
      })
    },
    [onLifecycle],
  )

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        accept(await backofficeApi.organizationHandover(organizationId, signal))
        setState('ready')
      } catch (caught) {
        if (signal?.aborted) return
        if (caught instanceof BackofficeApiError && caught.status === 401) {
          window.location.assign('/')
          return
        }
        setRefused(isRefusal(caught))
        setFailure(failureMessage(caught))
        setState('failed')
      }
    },
    [accept, organizationId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function run(action: 'resend' | 'cancel') {
    if (!handover) return
    const stageBefore = handoverStage(handover, now)
    setBusy(true)
    setNotice(null)
    try {
      accept(
        action === 'resend'
          ? await backofficeApi.resendOrganizationHandover(organizationId, newBackofficeCommand())
          : await backofficeApi.cancelOrganizationHandover(organizationId, newBackofficeCommand()),
      )
      toast.success(action === 'resend' ? resendNotice(stageBefore) : CANCELLED_NOTICE)
    } catch (caught) {
      if (caught instanceof BackofficeApiError && caught.status === 401) {
        window.location.assign('/')
        return
      }
      setNotice(failureMessage(caught))
      if (caught instanceof BackofficeApiError && caught.code === 'conflict') await load()
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return <ScreenLoading />

  if (state === 'failed' || !handover) {
    return (
      <div data-organization-handover>
        <ScreenFailure
          refused={refused}
          duties={['manage_organization_lifecycle']}
          title="No se pudo leer la entrega"
          message={failure ?? handoverMessage('upstream-unavailable')}
        />
      </div>
    )
  }

  const stage = handoverStage(handover, now)
  const invitation = handover.invitation
  const cancelledBy = cancelledBySentence(handover)

  return (
    <div data-organization-handover data-stage={stage}>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Entrega a su dueño
          </CardTitle>
        </CardHeader>
        <CardContent data-card-body>
          <Alert
            live="polite"
            variant={stage === 'claimed' ? 'success' : 'info'}
            data-handover-stage
          >
            <AlertTitle>
              <Badge variant={stageTone(stage)}>{stageLabel(stage)}</Badge>
            </AlertTitle>
            <AlertDescription>{stageSentence(handover, stage)}</AlertDescription>
          </Alert>

          <FieldGroup>
            <Field orientation="responsive">
              <FieldLabel htmlFor="ho-responsible">Quién responde</FieldLabel>
              <span id="ho-responsible">{responsibleSentence(handover)}</span>
            </Field>
            <Field orientation="responsive">
              <FieldLabel htmlFor="ho-site-view">Sede</FieldLabel>
              <span id="ho-site-view">{siteLine(handover)}</span>
            </Field>
            <Field orientation="responsive">
              <FieldLabel htmlFor="ho-invited">Invitación enviada a</FieldLabel>
              <code id="ho-invited">{invitation?.contact_hint ?? '—'}</code>
            </Field>
            <Field orientation="responsive">
              <FieldLabel htmlFor="ho-created">Creado</FieldLabel>
              <span id="ho-created">
                {formatInstant(handover.created_at)}.{' '}
                <span data-handover-created-by>{createdBySentence(handover)}</span>
              </span>
            </Field>
            {cancelledBy ? (
              <Field orientation="responsive">
                <FieldLabel htmlFor="ho-cancelled">Cancelación</FieldLabel>
                <span id="ho-cancelled" data-handover-cancelled-by>
                  {formatInstant(handover.cancelled_at)}. {cancelledBy}
                </span>
              </Field>
            ) : null}
          </FieldGroup>

          {/* HU-BO-034 c1: a gym that waits for its owner is sold its quota, one tab away. */}
          {handover.status === 'unclaimed' ? (
            <Button type="button" variant="link" onClick={onShowQuota} data-handover-file-link>
              Fijar su cupo en «Cupo y plan»
            </Button>
          ) : null}

          {canActOn(stage) ? (
            <span data-handover-actions>
              <Button type="button" disabled={busy} onClick={() => void run('resend')}>
                {busy ? 'Enviando…' : 'Enviar la invitación de nuevo'}
              </Button>
              <ConfirmAction
                trigger={<Button type="button" variant="outline" disabled={busy} />}
                label="Cancelar la creación"
                title="¿Cancelar la creación?"
                confirmLabel="Sí, cancelar la creación"
                busyLabel="Cancelando…"
                keepLabel="No, dejarlo como está"
                busy={busy}
                onConfirm={() => run('cancel')}
              >
                El gimnasio queda cancelado y su invitación retirada. Nadie podrá reclamarlo y no se
                puede deshacer.
              </ConfirmAction>
            </span>
          ) : null}
        </CardContent>
      </Card>

      {notice ? (
        <Alert live="assertive" variant="danger">
          <AlertTitle>No se completó la operación</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return handoverMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return handoverMessage(error.code)
  return handoverMessage('upstream-unavailable')
}
