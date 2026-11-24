'use client'

/**
 * `HU-BO-013` — a gym's file: its data, its owner, its sites and its team.
 *
 * Three decisions, and none of them is layout.
 *
 * **People are identifiers.** The owner and the team come without names, as ordinary
 * support reads them. Opening one person's card needs the case that justifies it, so
 * the member links appear only once a traceable case reference is written, and the
 * screen says why before anyone looks for a name.
 *
 * **Withheld and unknown are said as such.** A natural person's site address is
 * reserved because it can be their home, and people served, plans, the payment method
 * and Premium are listed as not yet stored by Allfit rather than as empty.
 *
 * **A gym that never had an owner is handed over, not run.** Its handover is the tab
 * right after the summary, where the only two things Allfit may do wait.
 *
 * Nine cards and a screen apart became tabs in the address, so a reload or a link
 * lands on the one meant: Resumen, Entrega, Equipo, Invitaciones, Cupo y plan and
 * Suspensión. The handover and the invitations are read only when their tab first
 * opens, since they name the people invited. A gym nobody claimed has no invitations,
 * and a claimed one no handover: its owner's own gym never had one.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { ScreenFailure, ScreenLoading } from './screen-state'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { Field, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@allfitone/react/components/tabs'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  type BackofficeOrganizationFile,
} from '@/lib/backoffice-api'
import { statusLabel, statusTone } from '@/lib/organization-directory'
import {
  IDENTIFIERS_NOTE,
  NO_PLANS_NOTE,
  paymentMethodLine,
  planLine,
  premiumLine,
  fileMessage,
  handsOverHere,
  memberCardHref,
  organizationFileHref,
  organizationTabFromQuery,
  organizationTabs,
  responsibleLabel,
  rolesLabel,
  siteAddress,
  peopleServedSentence,
  teamSentence,
  type OrganizationTab,
} from '@/lib/organization-file'
import { menuCrumb } from '@/lib/backoffice-routes'
import { formatInstant } from '@/lib/platform-access'
import { isRefusal } from '@/lib/screen-state'
import { useOpenedTabs } from '@/lib/use-opened-tabs'

import { OrganizationClientInvitations } from './organization-client-invitations'
import { OrganizationGuestQuotaPanel } from './organization-guest-quota'
import { OrganizationHandoverPanel, type HandoverLifecycle } from './organization-handover'
import { OrganizationSuspensionPanel } from './organization-suspension'
import { OrganizationTeamInvitations } from './organization-team-invitations'
import { RecordHeader } from './page-header'
import { RecordId } from './record-id'

type LoadState = 'loading' | 'ready' | 'failed'

export function OrganizationFile({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<LoadState>('loading')
  const [file, setFile] = useState<BackofficeOrganizationFile | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [caseReference, setCaseReference] = useState('')
  // What the handover tab learned since the file was read: a cancellation, or a claim.
  const [lifecycle, setLifecycle] = useState<HandoverLifecycle | null>(null)
  const requested = useSearchParams().get('tab')
  const tab = file ? organizationTabFromQuery(requested, organizationTabs(file)) : 'summary'
  const opened = useOpenedTabs(tab)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        setFile(await backofficeApi.organizationFile(organizationId, controller.signal))
        setState('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof BackofficeApiError && error.status === 401) {
          window.location.assign('/')
          return
        }
        setRefused(isRefusal(error))
        setFailure(failureMessage(error))
        setState('failed')
      }
    })()
    return () => controller.abort()
  }, [organizationId])

  if (state === 'loading') return <ScreenLoading />

  if (state === 'failed' || !file) {
    return (
      <div data-organization-file>
        <RecordHeader trail={[menuCrumb('/organizations')]} name="Ficha del gimnasio" />
        <ScreenFailure
          refused={refused}
          duties={['manage_organization_lifecycle', 'diagnose_support_metadata']}
          title="No se pudo abrir la ficha"
          message={failure ?? fileMessage('upstream-unavailable')}
        />
      </div>
    )
  }

  // The tabs stay those of the file as read, so a claim does not pull the open tab away.
  const organization = { ...file.organization, ...lifecycle }
  const ownerHref = file.owner ? memberCardHref(file.owner.person_id, caseReference) : undefined
  const tabs = organizationTabs(file)

  // Next keeps `useSearchParams` in step with the history API: no navigation, no reload.
  function showTab(next: string | null): void {
    window.history.replaceState(
      null,
      '',
      organizationFileHref(organizationId, organizationTabFromQuery(next, tabs)),
    )
  }

  return (
    <div data-organization-file>
      <RecordHeader
        trail={[menuCrumb('/organizations')]}
        name={organization.display_name}
        status={
          <Badge id="file-status" variant={statusTone(organization.status)}>
            {statusLabel(organization.status)}
          </Badge>
        }
        description={organization.type_name}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => showTab(typeof value === 'string' ? value : null)}
        data-organization-tabs
      >
        <TabsList variant="line" aria-label="Secciones de la ficha">
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {TAB_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="summary" keepMounted data-record-tab>
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Datos del gimnasio
              </CardTitle>
            </CardHeader>
            <CardContent data-card-body>
              <dl data-facts>
                <dt>Quién responde</dt>
                <dd>
                  <span id="file-responsible">{responsibleLabel(file)}</span>
                </dd>
                <dt>Creado</dt>
                <dd>
                  <span id="file-created">{formatInstant(organization.created_at)}</span>
                </dd>
                {organization.claimed_at ? (
                  <>
                    <dt>Reclamado</dt>
                    <dd>
                      <span id="file-claimed">{formatInstant(organization.claimed_at)}</span>
                    </dd>
                  </>
                ) : null}
                {organization.cancelled_at ? (
                  <>
                    <dt>Cancelado</dt>
                    <dd>
                      <span id="file-cancelled">{formatInstant(organization.cancelled_at)}</span>
                    </dd>
                  </>
                ) : null}
              </dl>
              {/* What its quota is measured against, so it reads with the gym, not its team. */}
              <Alert live="off" variant="info" data-file-people-served>
                <AlertTitle>Personas que atiende</AlertTitle>
                <AlertDescription>{peopleServedSentence(file)}</AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Sedes
              </CardTitle>
            </CardHeader>
            <CardContent data-card-body>
              {file.sites.length === 0 ? (
                <span data-file-no-sites>Sin sedes declaradas.</span>
              ) : (
                <Table scrollAreaLabel="Sedes">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sede</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {file.sites.map((site) => (
                      <TableRow
                        key={site.site_id}
                        data-file-site
                        data-address-withheld={site.address_withheld}
                      >
                        <TableCell>{site.name}</TableCell>
                        <TableCell>{siteAddress(site)}</TableCell>
                        <TableCell>
                          <Badge variant={site.status === 'active' ? 'success' : 'secondary'}>
                            {site.status === 'active' ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {handsOverHere(file) ? (
          <TabsContent value="handover" keepMounted data-record-tab>
            {opened.has('handover') ? (
              <OrganizationHandoverPanel
                organizationId={organization.organization_id}
                onLifecycle={setLifecycle}
                onShowQuota={() => showTab('plan')}
              />
            ) : null}
          </TabsContent>
        ) : null}

        <TabsContent value="team" keepMounted data-record-tab>
          {opened.has('team') ? (
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Dueño y equipo
                </CardTitle>
                <CardDescription>{IDENTIFIERS_NOTE}</CardDescription>
              </CardHeader>
              <CardContent data-card-body>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="file-case">
                      Referencia de caso para abrir una persona
                    </FieldLabel>
                    <Input
                      id="file-case"
                      value={caseReference}
                      onChange={(event) => setCaseReference(event.target.value)}
                      placeholder="CASE-2026-001"
                      autoComplete="off"
                    />
                  </Field>
                </FieldGroup>
                <dl data-facts>
                  <dt>Dueño</dt>
                  <dd>
                    {file.owner ? (
                      <span id="file-owner" data-file-owner>
                        <MemberIdentifier personId={file.owner.person_id} href={ownerHref} /> ·
                        desde {formatInstant(file.owner.since)}
                      </span>
                    ) : (
                      <span id="file-owner">Sin dueño: nadie ha reclamado el gimnasio.</span>
                    )}
                  </dd>
                </dl>

                <Alert live="off" variant="info" data-file-team-summary>
                  <AlertTitle>Equipo</AlertTitle>
                  <AlertDescription>{teamSentence(file)}</AlertDescription>
                </Alert>

                {file.team.length > 0 ? (
                  <Table scrollAreaLabel="Equipo">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Persona</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Desde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {file.team.map((member) => (
                        <TableRow key={member.membership_id} data-file-member>
                          <TableCell>
                            <MemberIdentifier
                              personId={member.person_id}
                              href={memberCardHref(member.person_id, caseReference)}
                            />
                          </TableCell>
                          <TableCell>{rolesLabel(member.roles)}</TableCell>
                          <TableCell>{formatInstant(member.joined_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* A gym nobody claimed has no team and no clients yet, so neither kind of
            invitation exists for it. */}
        {handsOverHere(file) ? null : (
          <TabsContent value="invitations" keepMounted data-record-tab>
            {opened.has('invitations') ? (
              <>
                <OrganizationTeamInvitations organizationId={organization.organization_id} />
                <OrganizationClientInvitations organizationId={organization.organization_id} />
              </>
            ) : null}
          </TabsContent>
        )}

        <TabsContent value="plan" keepMounted data-record-tab>
          {opened.has('plan') ? (
            <>
              <Card data-file-plans>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Planes y cobro
                  </CardTitle>
                  <CardDescription>
                    Lo que el gimnasio le cobra a sus clientes, en su propia pasarela. El dinero no
                    pasa por Allfit One y aquí no hay ninguna credencial.
                  </CardDescription>
                </CardHeader>
                <CardContent data-card-body>
                  {file.plans.length === 0 ? (
                    <p data-file-no-plans>{NO_PLANS_NOTE}</p>
                  ) : (
                    <ul>
                      {file.plans.map((plan) => (
                        <li key={plan.plan_id} data-file-plan={plan.plan_id}>
                          <strong>{plan.name}</strong> · {planLine(plan)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p data-file-payment-method>{paymentMethodLine(file)}</p>
                  <p data-file-premium>{premiumLine(file)}</p>
                </CardContent>
              </Card>

              <OrganizationGuestQuotaPanel quota={file.guest_quota} />
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="suspension" keepMounted data-record-tab>
          {opened.has('suspension') ? (
            <OrganizationSuspensionPanel
              suspension={file.suspension}
              peopleServed={file.relationship_counts.active}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}

const TAB_LABELS: Record<OrganizationTab, string> = {
  summary: 'Resumen',
  handover: 'Entrega',
  team: 'Equipo',
  invitations: 'Invitaciones',
  plan: 'Cupo y plan',
  suspension: 'Suspensión',
}

function MemberIdentifier({ personId, href }: { personId: string; href: string | undefined }) {
  return <RecordId id={personId} href={href} />
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return fileMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return fileMessage(error.code)
  return fileMessage('upstream-unavailable')
}
