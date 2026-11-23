'use client'

/**
 * Who is signed in and how long for, at the top of the home screen.
 *
 * It answers the two questions an operator has before touching anything: is
 * this my session, and will it still be there when I finish. What they may do
 * is not here on purpose: the API does not tell a session its duties, and each
 * screen asks for its own on every call. The note says where duties come from.
 */

import { Badge } from '@allfitone/react/components/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import Link from 'next/link'

import { useBackofficeSession } from './backoffice-session-context'

import { formatInstant } from '@/lib/platform-access'

export function OperatorPanel() {
  const session = useBackofficeSession()
  const name = `${session.operator.given_name} ${session.operator.family_name}`.trim()

  return (
    <Card data-operator-panel>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {name}
        </CardTitle>
        <CardDescription>
          Sesión confirmada con tu autenticador el {formatInstant(session.assurance_verified_at)}.
        </CardDescription>
      </CardHeader>
      <CardContent data-card-body>
        <dl data-operator-session>
          <div>
            {/* AAL2 names a standard; what the operator did is sign in with two factors. */}
            <dt>Verificación</dt>
            <dd>
              <Badge variant="success">Dos factores</Badge>
            </dd>
          </div>
          <div>
            <dt>Caduca si no la usas</dt>
            <dd>{formatInstant(session.inactivity_expires_at)}</dd>
          </div>
          <div>
            <dt>Termina a más tardar</dt>
            <dd>{formatInstant(session.absolute_expires_at)}</dd>
          </div>
        </dl>
        <p data-operator-note>
          Lo que puedes hacer lo deciden tus deberes vigentes, no el rol: cada pantalla lo vuelve a
          comprobar. Se otorgan, vencen y se renuevan en{' '}
          <Link href="/team">Equipo de Allfit One</Link>.
        </p>
      </CardContent>
    </Card>
  )
}
