'use client'

/**
 * The form that applies a legal hold (`HU-BO-033`), from the hold screen or from an
 * erasure request.
 *
 * It starts from a person, because a hold arrives with an order and before anybody
 * asks to delete. Opened from a request, the person is that request's and is not
 * edited here, and the kinds still waiting there come marked.
 *
 * It refuses to send what the server would refuse — no person, no kind of data, no end
 * date — and says which field is missing, in the order it shows them. What applying
 * does is said before it happens: it keeps, it opens nothing, and it ends on its date.
 *
 * It is a dialog over the list it was opened from. It used to appear at the foot of
 * the page, below the tables, and a refusal was said in an alert above them, which
 * the dialog would now cover; so the refusal is said inside it, beside the button.
 */

import { Button } from '@allfitone/react/components/button'
import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
import { Checkbox } from '@allfitone/react/components/checkbox'
import { Field, FieldError, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'

import { DayField } from './date-fields'

import {
  HOLDABLE_CATEGORIES,
  HOLD_REASONS,
  categoryLabel,
  holdIssueMessage,
  holdReasonLabel,
  type HoldDraft,
  type HoldIssue,
  type HoldableCategory,
  type LegalHoldReason,
} from '@/lib/legal-holds'

export interface LegalHoldFormProps {
  open: boolean
  draft: HoldDraft
  onChange: (draft: HoldDraft) => void
  issue: HoldIssue | null
  busy: boolean
  /** Opened from a request: the person is that request's. */
  subjectFixed?: boolean
  submitLabel: string
  /** Why the last attempt was refused, said where the officer is looking. */
  failure: string | null
  onSubmit: () => void
  onCancel: () => void
}

export function LegalHoldForm({
  open,
  draft,
  onChange,
  issue,
  busy,
  subjectFixed = false,
  submitLabel,
  failure,
  onSubmit,
  onCancel,
}: LegalHoldFormProps) {
  const set = (patch: Partial<HoldDraft>) => onChange({ ...draft, ...patch })
  const toggle = (code: HoldableCategory, checked: boolean) =>
    set({
      categories: checked
        ? HOLDABLE_CATEGORIES.filter((one) => one === code || draft.categories.includes(one))
        : draft.categories.filter((one) => one !== code),
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would hide a request that is still going to land.
        if (!next && !busy) onCancel()
      }}
    >
      <DialogContent data-legal-hold-form>
        <DialogHeader>
          <DialogTitle>Retener datos por una obligación legal</DialogTitle>
          <DialogDescription>
            Conserva los datos de esta persona de los tipos que marques: lo que ya espera borrarse
            se detiene, y lo que pida borrar mientras dure se queda, y se le dice por qué y hasta
            cuándo. No da acceso a nada: para leer lo que registró hace falta una ventana
            excepcional. No existen retenciones indefinidas: en su fecha, la retención vence sola.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="hold-subject">Persona</FieldLabel>
            <Input
              id="hold-subject"
              value={draft.subjectPersonId}
              readOnly={subjectFixed}
              disabled={busy}
              placeholder="Identificador de la persona"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => set({ subjectPersonId: event.target.value })}
            />
            {issue === 'subject' ? <FieldError>{holdIssueMessage(issue)}</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="hold-categories">Tipos de dato que se conservan</FieldLabel>
            <div id="hold-categories" data-legal-hold-categories>
              {HOLDABLE_CATEGORIES.map((code) => (
                <Field key={code} orientation="horizontal">
                  <Checkbox
                    id={`hold-kind-${code}`}
                    disabled={busy}
                    checked={draft.categories.includes(code)}
                    onCheckedChange={(checked) => toggle(code, checked === true)}
                  />
                  <FieldLabel htmlFor={`hold-kind-${code}`}>{categoryLabel(code)}</FieldLabel>
                </Field>
              ))}
            </div>
            {issue === 'categories' ? <FieldError>{holdIssueMessage(issue)}</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="hold-scope">Alcance</FieldLabel>
            <Input
              id="hold-scope"
              value={draft.scopeDescription}
              disabled={busy}
              onChange={(event) => set({ scopeDescription: event.target.value })}
            />
            {issue === 'scope' ? <FieldError>{holdIssueMessage(issue)}</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="hold-reason">Motivo</FieldLabel>
            <Select
              value={draft.reasonCode}
              onValueChange={(next) =>
                set({ reasonCode: (next ?? 'judicial_order') as LegalHoldReason })
              }
            >
              <SelectTrigger id="hold-reason" disabled={busy}>
                <SelectValue>{holdReasonLabel(draft.reasonCode)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {HOLD_REASONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {holdReasonLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="hold-case">Referencia del requerimiento</FieldLabel>
            <Input
              id="hold-case"
              value={draft.caseReference}
              disabled={busy}
              onChange={(event) => set({ caseReference: event.target.value })}
            />
            {issue === 'case' ? <FieldError>{holdIssueMessage(issue)}</FieldError> : null}
          </Field>

          <Field>
            <DayField
              id="hold-until"
              label="Vigente hasta"
              value={draft.validTo}
              disabled={busy}
              onChange={(validTo) => set({ validTo })}
            />
            {issue === 'vigency' ? <FieldError>{holdIssueMessage(issue)}</FieldError> : null}
          </Field>
        </FieldGroup>

        {failure ? (
          <Alert live="assertive" variant="danger" data-legal-hold-failure>
            <AlertTitle>No se aplicó la retención</AlertTitle>
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter data-confirm-footer>
          <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>
            Cancelar
          </DialogClose>
          <Button type="button" disabled={busy} onClick={onSubmit}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
