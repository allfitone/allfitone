'use client'

/**
 * `HU-BO-014` and `HU-BO-015` — where a handover stands, and the only two things
 * Allfit may do while it waits.
 *
 * **Waiting is not done.** The badge and the sentence say whether the owner has not
 * answered, let the invitation lapse, rejected it, accepted it, or whether the
 * creation was cancelled. Only the first three allow any action.
 *
 * **Neither action changes the address.** Resending goes to the same email, and the
 * screen says whether the original invitation was sent again or replaced.
 * Cancelling asks once more before it happens, because it cannot be undone.
 *
 * **A lost race is re-read, not guessed.** If the owner accepted or someone else
 * cancelled meanwhile, the command is refused and the screen reads the handover
 * again rather than showing a state it no longer has.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@allfitone/react/components/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import { ScreenFailure, ScreenLoading } from './screen-state'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { Field, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
import Link from 'next/link'
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
  fileLink,
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

type LoadState = 'loading' | 'ready' | 'failed'
type Notice = { tone: 'success' | 'danger'; message: string }

export function OrganizationHandover({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<LoadState>('loading')
  const [handover, setHandover] = useState<Handover | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await backofficeApi.organizationHandover(organizationId, signal)
        setHandover(next)
        setNow(Date.now())
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
    [organizationId],
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
      const next =
        action === 'resend'
          ? await backofficeApi.resendOrganizationHandover(organizationId, newBackofficeCommand())
          : await backofficeApi.cancelOrganizationHandover(organizationId, newBackofficeCommand())
      setHandover(next)
      setNow(Date.now())
      setNotice({
        tone: 'success',
        message: action === 'resend' ? resendNotice(stageBefore) : CANCELLED_NOTICE,
      })
    } catch (caught) {
      if (caught instanceof BackofficeApiError && caught.status === 401) {
        window.location.assign('/')
        return
      }
      setNotice({ tone: 'danger', message: failureMessage(caught) })
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
        <Link href="/organizations" data-handover-link>
          Volver al directorio
        </Link>
      </div>
    )
  }

  const stage = handoverStage(handover, now)
  const invitation = handover.invitation
  const cancelledBy = cancelledBySentence(handover)
  const file = fileLink(handover)

  return (
    <div data-organization-handover data-stage={stage}>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {handover.display_name}
          </CardTitle>
          <CardDescription>{handover.type_name}</CardDescription>
        </CardHeader>
        <CardContent>
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

          {file ? (
            <Link href={file.href} data-handover-file-link>
              {file.label}
            </Link>
          ) : null}

          {canActOn(stage) ? (
            <span data-handover-actions>
              <Button type="button" disabled={busy} onClick={() => void run('resend')}>
                {busy ? 'Enviando…' : 'Enviar la invitación de nuevo'}
              </Button>
              <AlertDialog
                open={cancelling}
                onOpenChange={(next) => {
                  // Closing mid-flight would hide a request that is still going to land.
                  if (busy) return
                  setCancelling(next)
                }}
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setCancelling(true)}
                >
                  Cancelar la creación
                </Button>
                <AlertDialogContent data-cancel-handover-dialog>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cancelar la creación?</AlertDialogTitle>
                    <AlertDialogDescription>
                      El gimnasio queda cancelado y su invitación retirada. Nadie podrá reclamarlo y
                      no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>No, dejarlo como está</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void run('cancel').then(() => setCancelling(false))}
                    >
                      {busy ? 'Cancelando…' : 'Sí, cancelar la creación'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </span>
          ) : null}
        </CardContent>
      </Card>

      {notice ? (
        <Alert live={notice.tone === 'danger' ? 'assertive' : 'polite'} variant={notice.tone}>
          <AlertTitle>
            {notice.tone === 'danger' ? 'No se completó la operación' : 'Listo'}
          </AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      <Link href="/organizations" data-handover-link>
        Volver al directorio
      </Link>
    </div>
  )
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return handoverMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return handoverMessage(error.code)
  return handoverMessage('upstream-unavailable')
}
