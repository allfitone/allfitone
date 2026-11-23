'use client'

/**
 * `HU-BO-004` — how the business is going.
 *
 * One number per figure, with the period under it, because a figure whose period
 * the reader has to assume is worse than no figure. Each section is one card and its
 * figures sit in a grid inside it: sixteen cards of their own, each with a «Medido»
 * badge, made Inicio 3473px tall. A figure the platform cannot
 * give is drawn blank with the reason in its place: never a zero, which would be
 * read as "the business is at zero" rather than "we cannot answer".
 *
 * What a figure counts sits behind an info button beside its name. It is read once
 * and skipped every day after; the period and the reason for a blank stay in sight,
 * because they change what the number means today.
 *
 * The two activity figures sit next to each other on purpose. People training in
 * Space is the question the founder is actually asking and has no answer at all;
 * professionals working in Studio is what the platform does record. Showing the
 * second alone, unlabelled, would quietly answer the first with the wrong number.
 *
 * Being refused is not an error: a withdrawn admin role is a real state, so it is said in
 * plain words and the rest of the screen carries on without it.
 */

import {
  AccentBlock,
  AccentBlockLabel,
  AccentBlockMeta,
  AccentBlockTitle,
} from '@allfitone/react/components/accent-block'
import { Badge } from '@allfitone/react/components/badge'
import { ScreenFailure, ScreenLoading, ScreenRefusal } from './screen-state'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { IconButton } from '@allfitone/react/components/icon-button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@allfitone/react/components/popover'
import { FoundationIcon } from '@allfitone/react/icons'
import { useEffect, useState, type ReactNode } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  type SupportBusinessPanel,
} from '@/lib/backoffice-api'
import {
  businessMessage,
  businessSections,
  metricBadge,
  metricHint,
  metricLabel,
  metricNote,
  metricValue,
  moneyLines,
  moneyNote,
  periodPhrase,
} from '@/lib/business-panel'
import { formatInstant } from '@/lib/platform-access'

type LoadState = 'loading' | 'ready' | 'refused' | 'failed'

export function BusinessPanel() {
  const [state, setState] = useState<LoadState>('loading')
  const [failure, setFailure] = useState<string | null>(null)
  const [panel, setPanel] = useState<SupportBusinessPanel | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        setPanel(await backofficeApi.supportBusiness(controller.signal))
        setState('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof BackofficeApiError && error.status === 401) {
          window.location.assign('/')
          return
        }
        setFailure(failureMessage(error))
        setState(
          error instanceof BackofficeApiError && error.code === 'forbidden' ? 'refused' : 'failed',
        )
      }
    })()
    return () => controller.abort()
  }, [])

  if (state === 'loading') return <ScreenLoading />

  if (state === 'refused') {
    return (
      <ScreenRefusal
        duties={['view_platform_metrics']}
        title="Cómo va el negocio"
        data-business-refused
      >
        {failure ?? businessMessage('forbidden')}
      </ScreenRefusal>
    )
  }

  if (state === 'failed' || !panel) {
    return (
      <ScreenFailure
        refused={false}
        duties={[]}
        title="No se pudo leer cómo va el negocio"
        message={failure ?? businessMessage('upstream-unavailable')}
      />
    )
  }

  return (
    <div data-business-panel>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Cómo va el negocio
          </CardTitle>
          <CardDescription>
            Cada cifra dice de qué periodo es. Lo que la plataforma todavía no puede calcular
            aparece vacío con su razón, nunca en cero, y un grupo de menos de{' '}
            {panel.minimum_aggregate} personas no se publica. Leído:{' '}
            {formatInstant(panel.generated_at)}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Money first inside its own section: an amount is what the founder opens this
          screen for, and it is the one figure that is not a count of anything. */}
      {panel.money.length > 0 ? (
        <Card data-business-section="billed">
          <CardHeader>
            <CardTitle role="heading" aria-level={3}>
              Facturado por Allfit One
            </CardTitle>
            <CardDescription>
              Lo que las tiendas cobraron por Pro. Un gimnasio cobra en su propia pasarela, así que
              lo que sus clientes le pagan no aparece aquí y no es ingreso de Allfit One.
            </CardDescription>
          </CardHeader>
          <CardContent data-card-body>
            <div data-business-metrics>
              {panel.money.map((metric) => {
                const lines = moneyLines(metric)
                const note = moneyNote(metric, panel.minimum_aggregate)
                return (
                  <AccentBlock
                    key={metric.key}
                    role="group"
                    aria-label={metricLabel(metric.key)}
                    data-business-money={metric.key}
                    data-availability={metric.availability}
                  >
                    <MetricName metricKey={metric.key}>
                      <AccentBlockLabel>{metricLabel(metric.key)}</AccentBlockLabel>
                    </MetricName>
                    {lines.length > 0 ? (
                      lines.map((line) => (
                        <AccentBlockTitle key={line} data-business-value>
                          {line}
                        </AccentBlockTitle>
                      ))
                    ) : (
                      <AccentBlockTitle data-business-value>—</AccentBlockTitle>
                    )}
                    <AccentBlockMeta data-business-period>
                      {periodPhrase(metric.period)}
                    </AccentBlockMeta>
                    {note ? <AccentBlockMeta data-business-note>{note}</AccentBlockMeta> : null}
                  </AccentBlock>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {businessSections(panel).map((section) => (
        <Card key={section.key} data-business-section={section.key}>
          <CardHeader>
            <CardTitle role="heading" aria-level={3}>
              {section.title}
            </CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent data-card-body>
            <div data-business-metrics>
              {section.metrics.map((metric) => {
                const badge = metricBadge(metric)
                const note = metricNote(metric, panel.minimum_aggregate)
                return (
                  <div
                    key={metric.key}
                    data-business-metric={metric.key}
                    data-availability={metric.availability}
                  >
                    <div data-business-body>
                      <MetricName metricKey={metric.key}>
                        <h4 data-business-label>{metricLabel(metric.key)}</h4>
                      </MetricName>
                      <p data-business-value>{metricValue(metric)}</p>
                      <p data-business-period>{periodPhrase(metric.period)}</p>
                      {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                      {note ? <p data-business-note>{note}</p> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** A figure's name, with what it counts one click away when there is something to say. */
function MetricName({ metricKey, children }: { metricKey: string; children: ReactNode }) {
  const label = metricLabel(metricKey)
  const hint = metricHint(metricKey)
  return (
    <div data-business-name>
      {children}
      {hint ? (
        <Popover>
          <PopoverTrigger
            render={
              <IconButton
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Qué cuenta «${label}»`}
              />
            }
          >
            <FoundationIcon name="info" decorative />
          </PopoverTrigger>
          <PopoverContent align="start" data-business-definition>
            {/* The title is what names the popover to a screen reader. */}
            <PopoverHeader>
              <PopoverTitle>{label}</PopoverTitle>
              <PopoverDescription>{hint}</PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return businessMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return businessMessage(error.code)
  return businessMessage('upstream-unavailable')
}
