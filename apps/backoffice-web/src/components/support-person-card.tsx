'use client'

/**
 * `HU-BO-007` — the operational state of a person, minimised.
 *
 * The card refuses to load without a case reference rather than defaulting to
 * one. That is not strictness for its own sake: the read is recorded against
 * that reference, and a card that opened without one would produce a record
 * nobody can follow.
 *
 * The four blocks Allfit does not store yet are shown, not omitted. An operator
 * who simply does not see "relaciones" cannot tell whether the screen forgot it
 * or the platform lacks it, and the second is the truth. Criterion 5 asks for
 * unknown to read as empty rather than as zero; this goes one step further,
 * because "esta persona no tiene relaciones" would be a claim we cannot make.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import { ScreenLoading } from './screen-state'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Fragment, useEffect, useState } from 'react'

import { AccountRecoveryPanel } from '@/components/account-recovery'
import { SupportPaymentsPanel } from '@/components/support-payments'
import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  type SupportPersonMetadata,
} from '@/lib/backoffice-api'
import { formatInstant } from '@/lib/platform-access'
import {
  fileFacts,
  isValidCaseReference,
  supportMetadataMessage,
  verificationLabel,
} from '@/lib/support-metadata'

type LoadState = 'loading' | 'ready' | 'failed'

export function SupportPersonCard({ personId }: { personId: string }) {
  const caseReference = useSearchParams().get('case_reference') ?? ''
  const traceable = isValidCaseReference(caseReference)
  const [state, setState] = useState<LoadState>('loading')
  const [metadata, setMetadata] = useState<SupportPersonMetadata | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    if (!traceable) return
    const controller = new AbortController()
    void (async () => {
      try {
        setMetadata(
          await backofficeApi.supportPersonMetadata(personId, caseReference, controller.signal),
        )
        setState('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof BackofficeApiError && error.status === 401) {
          window.location.assign('/')
          return
        }
        setFailure(failureMessage(error))
        setState('failed')
      }
    })()
    return () => controller.abort()
  }, [personId, caseReference, traceable])

  if (!traceable) {
    return (
      <Alert live="polite" variant="warning">
        <AlertTitle>Esta ficha necesita una referencia de caso</AlertTitle>
        <AlertDescription>
          La consulta queda registrada contra el caso que la justifica, así que no se abre sin una.
          Vuelve a la búsqueda y empieza desde ahí.{' '}
          <Button size="sm" variant="ghost" render={<Link href="/people" />} nativeButton={false}>
            Ir a la búsqueda
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (state === 'loading') return <ScreenLoading />

  if (state === 'failed' || !metadata) {
    return (
      <Alert live="assertive" variant="danger">
        <AlertTitle>No se pudo abrir el estado operativo</AlertTitle>
        <AlertDescription>
          {failure ?? supportMetadataMessage('upstream-unavailable')}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div data-support-person>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Estado operativo
          </CardTitle>
          <CardDescription>
            Caso {caseReference}. Sin nombres ni contactos completos: para resolver un caso de
            entrenamiento, cuerpo, salud o nutrición hace falta un acceso excepcional aparte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl data-facts>
            <dt>Identificador</dt>
            <dd>
              <code id="person-id">{metadata.person_id}</code>
            </dd>
            <dt>Estado de la cuenta</dt>
            <dd>
              <Badge
                id="person-status"
                variant={metadata.account_status === 'active' ? 'success' : 'secondary'}
              >
                {metadata.account_status}
              </Badge>
            </dd>
            <dt>Antigüedad</dt>
            <dd>
              <span id="person-since">
                Creada el {formatInstant(metadata.created_at)}
                {metadata.activated_at
                  ? ` · activada el ${formatInstant(metadata.activated_at)}`
                  : ''}
              </span>
            </dd>
          </dl>

          <Table scrollAreaLabel="Contacto y verificación">
            <TableHeader>
              <TableRow>
                <TableHead>Contacto</TableHead>
                <TableHead>Valor parcial</TableHead>
                <TableHead>Verificación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Correo</TableCell>
                <TableCell>
                  <code>{metadata.contact_email_masked ?? 'sin correo'}</code>
                </TableCell>
                <TableCell>
                  {verificationLabel(metadata.email_verified_at)}
                  {metadata.email_verified_at
                    ? ` · ${formatInstant(metadata.email_verified_at)}`
                    : ''}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Teléfono</TableCell>
                <TableCell>
                  <code>{metadata.contact_phone_masked ?? 'sin teléfono'}</code>
                </TableCell>
                <TableCell>
                  {verificationLabel(metadata.phone_verified_at)}
                  {metadata.phone_verified_at
                    ? ` · ${formatInstant(metadata.phone_verified_at)}`
                    : ''}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Acceso y pertenencia
          </CardTitle>
          <CardDescription>
            Suele resolver un caso de «no puedo entrar» sin abrir el dato de nadie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl data-facts>
            <dt>Cuenta de acceso</dt>
            <dd>
              <span id="person-account">
                {metadata.has_access_account
                  ? `Vinculada${metadata.access_account_linked_at ? ` el ${formatInstant(metadata.access_account_linked_at)}` : ''}`
                  : 'Sin cuenta vinculada'}
              </span>
            </dd>
            <dt>Sesiones activas</dt>
            <dd>
              <span id="person-sessions">{metadata.active_session_count}</span>
            </dd>
            <dt>Última actividad</dt>
            <dd>
              <span id="person-seen">
                {metadata.last_seen_at ? formatInstant(metadata.last_seen_at) : 'Nunca'}
              </span>
            </dd>
            <dt>Pertenencia a organizaciones</dt>
            <dd>
              <span id="person-memberships">
                {metadata.active_membership_count} vigentes de {metadata.membership_count}
              </span>
            </dd>
          </dl>
        </CardContent>
      </Card>

      <SupportPaymentsPanel personId={personId} caseReference={caseReference} />

      <AccountRecoveryPanel personId={personId} caseReference={caseReference} />

      <Card data-support-person-blocks>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Lo que existe alrededor de la persona
          </CardTitle>
          <CardDescription>
            Que existe, en qué estado y desde cuándo. No dice en qué gimnasio, qué permiso ni cuánto
            paga: para eso no es esta ficha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl data-facts>
            {fileFacts(metadata, formatInstant).map((fact) => (
              <Fragment key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </Fragment>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return supportMetadataMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return supportMetadataMessage(error.code)
  return supportMetadataMessage('upstream-unavailable')
}
