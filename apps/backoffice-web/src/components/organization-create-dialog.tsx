'use client'

/**
 * `HU-BO-014` — creating a gym for a sale and inviting its owner, in a dialog over
 * the directory: the list stays where the operator left it, and the new gym's file
 * opens on its handover once it exists.
 *
 * Three decisions, and none of them is layout.
 *
 * **No field asks for a person's name.** Choosing a natural person hides the legal
 * name instead of leaving it empty, and says why: the name arrives with their own
 * account when they accept.
 *
 * **The button says what happens.** It creates and invites in one step, and the
 * dialog says up front that the gym will not operate until its owner accepts, so
 * nobody reads "created" as "handed over".
 *
 * **A retry is the same command.** The command identifiers are kept while the form
 * does not change, closing the dialog included, so a timeout followed by a second
 * click converges on one gym instead of creating two.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { toast } from '@allfitone/react/components/sonner'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type BackofficeCommand,
} from '@/lib/backoffice-api'
import { organizationFileHref } from '@/lib/organization-file'
import {
  EMPTY_HANDOVER_DRAFT,
  ORGANIZATION_TYPES,
  PARTY_KINDS,
  handoverDraftIssue,
  handoverDraftIssueMessage,
  handoverMessage,
  partyKindExplanation,
  toHandoverCreate,
  type HandoverDraft,
  type HandoverDraftIssue,
  type OrganizationTypeCode,
} from '@/lib/organization-handover'

export function OrganizationCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<HandoverDraft>(EMPTY_HANDOVER_DRAFT)
  // Said under the field it is about, never at the foot of the form.
  const [issue, setIssue] = useState<HandoverDraftIssue | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef<{ body: string; command: BackofficeCommand } | null>(null)

  function update<K extends keyof HandoverDraft>(field: K, value: HandoverDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  /** The props that tie a control to its own problem, when it has one. */
  function flagged(field: HandoverDraftIssue) {
    return issue === field
      ? { 'aria-invalid': true as const, 'aria-describedby': `ho-issue-${field}` }
      : {}
  }

  function issueUnder(field: HandoverDraftIssue) {
    return issue === field ? (
      <FieldError id={`ho-issue-${field}`}>{handoverDraftIssueMessage(field)}</FieldError>
    ) : null
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const broken = handoverDraftIssue(draft)
    setIssue(broken ?? null)
    if (broken) return
    setFailure(null)
    const create = toHandoverCreate(draft)
    const body = JSON.stringify(create)
    // The same form is the same command: a retry converges instead of creating twice.
    if (pending.current?.body !== body) pending.current = { body, command: newBackofficeCommand() }
    setBusy(true)
    try {
      const handover = await backofficeApi.createOrganizationHandover(
        create,
        pending.current.command,
      )
      pending.current = null
      toast.success(`Se creó ${handover.display_name} y su invitación va en camino.`)
      router.push(organizationFileHref(handover.organization_id, 'handover'))
    } catch (caught) {
      if (caught instanceof BackofficeApiError && caught.status === 401) {
        window.location.assign('/')
        return
      }
      setFailure(failureMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would hide a request that is still going to land.
        if (busy) return
        onOpenChange(next)
      }}
    >
      <DialogContent data-organization-create>
        <DialogHeader>
          <DialogTitle>Crear un gimnasio</DialogTitle>
          <DialogDescription>
            Para una venta asistida. Crear no es entregar: el gimnasio no opera hasta que su dueño
            acepte la invitación, y mientras tanto Allfit One no lo administra ni crea las cuentas
            de su equipo. El dueño las invita desde Studio.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void submit(event)}
          data-backoffice-form
          data-handover-form
          noValidate
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ho-name">Nombre del gimnasio</FieldLabel>
              <Input
                id="ho-name"
                value={draft.displayName}
                onChange={(event) => update('displayName', event.target.value)}
                maxLength={120}
                autoComplete="off"
                disabled={busy}
                {...flagged('display-name')}
              />
              {issueUnder('display-name')}
            </Field>

            <Field>
              <FieldLabel htmlFor="ho-type">Tipo</FieldLabel>
              <Select
                items={ORGANIZATION_TYPES.map((type) => ({ value: type.code, label: type.label }))}
                value={draft.typeCode}
                onValueChange={(next) => update('typeCode', (next ?? '') as OrganizationTypeCode)}
              >
                <SelectTrigger id="ho-type" disabled={busy} {...flagged('type')}>
                  <SelectValue placeholder="Elige el tipo" />
                </SelectTrigger>
                <SelectContent>
                  {ORGANIZATION_TYPES.map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {issueUnder('type')}
            </Field>

            <Field>
              <FieldLabel htmlFor="ho-party">Quién responde por el gimnasio</FieldLabel>
              <ToggleGroup
                id="ho-party"
                data-handover-choice
                aria-label="Quién responde por el gimnasio"
                value={draft.partyKind ? [draft.partyKind] : []}
                onValueChange={(values) => {
                  const next = values[0]
                  if (next && next !== draft.partyKind) update('partyKind', next)
                }}
                disabled={busy}
                {...flagged('party-kind')}
              >
                {PARTY_KINDS.map((kind) => (
                  <ToggleGroupItem key={kind.code} value={kind.code}>
                    {kind.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {draft.partyKind ? (
                <span data-handover-party-explanation>{partyKindExplanation(draft.partyKind)}</span>
              ) : null}
              {issueUnder('party-kind')}
            </Field>

            {draft.partyKind === 'legal_entity' ? (
              <Field>
                <FieldLabel htmlFor="ho-legal">Razón social</FieldLabel>
                <Input
                  id="ho-legal"
                  value={draft.legalName}
                  onChange={(event) => update('legalName', event.target.value)}
                  maxLength={160}
                  autoComplete="off"
                  disabled={busy}
                  {...flagged('legal-name')}
                />
                {issueUnder('legal-name')}
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="ho-site">Sede (opcional)</FieldLabel>
              <Input
                id="ho-site"
                value={draft.siteName}
                onChange={(event) => update('siteName', event.target.value)}
                placeholder="Sede principal"
                maxLength={120}
                autoComplete="off"
                disabled={busy}
                {...flagged('site-name')}
              />
              {issueUnder('site-name')}
            </Field>

            <Field>
              <FieldLabel htmlFor="ho-address">Dirección de la sede (opcional)</FieldLabel>
              <Input
                id="ho-address"
                value={draft.siteAddress}
                onChange={(event) => update('siteAddress', event.target.value)}
                maxLength={240}
                autoComplete="off"
                disabled={busy}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="ho-email">Correo de quien será el dueño</FieldLabel>
              <Input
                id="ho-email"
                type="email"
                value={draft.ownerEmail}
                onChange={(event) => update('ownerEmail', event.target.value)}
                autoComplete="off"
                disabled={busy}
                {...flagged('email')}
              />
              {issue === 'email' ? null : (
                <FieldDescription>
                  La invitación va a este correo, nunca a una cuenta elegida desde aquí.
                </FieldDescription>
              )}
              {issueUnder('email')}
            </Field>

            {failure ? (
              <Alert live="assertive" variant="danger" data-organization-create-failure>
                <AlertTitle>No se pudo crear el gimnasio</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter data-confirm-footer>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creando…' : 'Crear y enviar la invitación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return handoverMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return handoverMessage(error.code)
  return handoverMessage('upstream-unavailable')
}
