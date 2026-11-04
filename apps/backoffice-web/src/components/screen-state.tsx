'use client'

/**
 * The states every Backoffice screen shares: still reading, refused, failed,
 * and nothing to show.
 *
 * They were a bare spinner, a yellow alert on an empty canvas and an info
 * alert, each worded by its own screen. Here a refusal is a closed door that
 * names the duty behind it and where to ask for it; a failure is something to
 * retry; and an empty list says what would fill it. A screen passes its own
 * sentence and keeps its own vocabulary: the shape is what is shared.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { FoundationIcon, type IconName } from '@allfitone/react/icons'
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

import type { PlatformDutyCode } from '@/lib/backoffice-api'
import { dutyLabel } from '@/lib/platform-access'

/** The shape of the screen, drawn before its content arrives. */
export function ScreenLoading({ label = 'Cargando' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} data-screen-loading>
      <Skeleton data-skeleton-line="title" />
      <Skeleton data-skeleton-line />
      <Skeleton data-skeleton-line="short" />
      <Skeleton data-skeleton-block />
    </div>
  )
}

/**
 * The door is closed for this session. `duties` are the ones that open it, so
 * the operator knows what to ask for; `children` is the screen's own sentence.
 */
export function ScreenRefusal({
  title = 'Esta pantalla pide un deber vigente',
  duties,
  children,
  ...props
}: Omit<ComponentProps<typeof Empty>, 'title'> & {
  title?: string
  duties: readonly PlatformDutyCode[]
  children: ReactNode
}) {
  return (
    <Empty role="status" data-screen-refusal {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FoundationIcon name="permissions" decorative />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {duties.length > 0 ? (
          <ul data-screen-duties aria-label="Deberes que la abren">
            {duties.map((duty) => (
              <li key={duty}>
                <Badge variant="secondary">{dutyLabel(duty)}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <Button variant="outline" size="sm" render={<Link href="/team" />} nativeButton={false}>
          Pedirlo en Equipo de Allfit
        </Button>
      </EmptyContent>
    </Empty>
  )
}

/** A read that did not come back: a refusal is a closed door, anything else gets a retry. */
export function ScreenFailure({
  refused,
  duties,
  title,
  message,
  onRetry,
  ...props
}: Omit<ComponentProps<typeof Alert>, 'title'> & {
  refused: boolean
  duties: readonly PlatformDutyCode[]
  title: string
  message: string
  onRetry?: () => void
}) {
  if (refused) {
    return (
      <ScreenRefusal duties={duties} {...props}>
        {message}
      </ScreenRefusal>
    )
  }
  return (
    <Alert live="assertive" variant="danger" data-screen-failure {...props}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  )
}

/** Nothing to list, said as what would fill the list. */
export function ScreenEmpty({
  icon = 'operation',
  title,
  children,
  actions,
  ...props
}: Omit<ComponentProps<typeof Empty>, 'title'> & {
  icon?: IconName
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <Empty data-screen-empty {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FoundationIcon name={icon} decorative />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
      {actions ? <EmptyContent>{actions}</EmptyContent> : null}
    </Empty>
  )
}
