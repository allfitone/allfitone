'use client'

/**
 * `HU-BO-006` — finding a person to help them.
 *
 * Four things about this screen are rules rather than layout.
 *
 * One field takes part of a name, an email or a phone (ADR-046 decision 4): an
 * administrator searches by what the person told them, not by an exact value
 * they would have to ask for again. The answer names each person and how to
 * reach them, so two people with similar names can be told apart.
 *
 * The case reference is optional. When there is one it lives in the URL, so a
 * reload keeps it and the file opens under the same case; one written in free
 * text is refused, because it would look traceable and not be.
 *
 * A search that finds nobody says so, and every search is recorded, with each
 * person it answered seeing it in her own history. The API answers an outcome
 * beside the items precisely so this screen cannot show an unexplained empty list.
 *
 * Coming back from a file shows the list the operator left without searching
 * again, which would record a second look on everyone in it. The list is kept in
 * memory (`PeopleSearchMemory`), never in the address, and only offered again
 * under the case it was recorded under.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import { FieldError } from '@allfitone/react/components/field'
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
import { useState, type FormEvent } from 'react'

import { BackofficeApiError, BackofficeNetworkError, backofficeApi } from '@/lib/backoffice-api'
import { isValidOptionalCaseReference, normalizeCaseReference } from '@/lib/case-reference'
import { personFileHref } from '@/lib/person-file'
import {
  accountStatusLabel,
  accountStatusTone,
  isSearchable,
  supportMetadataMessage,
} from '@/lib/support-metadata'

import { PageHeader } from './page-header'
import { usePeopleSearchMemory, type RememberedSearch } from './people-search-memory'
import { ScreenEmpty, ScreenLoading } from './screen-state'

interface Issues {
  term: string | null
  caseReference: string | null
}

const NO_ISSUES: Issues = { term: null, caseReference: null }

export function SupportPeopleSearch() {
  const addressCase = useSearchParams().get('case_reference') ?? ''
  // A new case in the address is a new search, which starts from what is remembered for it.
  return <PeopleSearch key={addressCase} addressCase={addressCase} />
}

function PeopleSearch({ addressCase }: { addressCase: string }) {
  const router = useRouter()
  const memory = usePeopleSearchMemory()
  // A list recorded under one case is not offered under another, nor under none.
  const restored =
    memory.last?.caseReference === normalizeCaseReference(addressCase) ? memory.last : null
  const [term, setTerm] = useState(restored?.term ?? '')
  const [caseReference, setCaseReference] = useState(restored?.caseReference ?? addressCase)
  const [issues, setIssues] = useState<Issues>(NO_ISSUES)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<RememberedSearch | null>(restored)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const wanted = term.trim()
    const reference = normalizeCaseReference(caseReference)
    const found: Issues = {
      term: isSearchable(wanted)
        ? null
        : 'Escribe al menos dos caracteres del nombre, el correo o el teléfono.',
      caseReference: isValidOptionalCaseReference(reference)
        ? null
        : 'La referencia del caso va como CASE-2026-001, o se deja vacía.',
    }
    setIssues(found)
    if (found.term || found.caseReference) return

    setNotice(null)
    setBusy(true)
    try {
      const result = await backofficeApi.searchSupportPeople({
        query: wanted,
        caseReference: reference,
      })
      const search = { term: wanted, caseReference: reference, result }
      setShown(search)
      memory.remember(search)
      // The reference survives a reload and travels to the file, which records it too.
      router.replace(
        reference ? `/people?case_reference=${encodeURIComponent(reference)}` : '/people',
      )
    } catch (failure) {
      setShown(null)
      setNotice(failureMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-support-search>
      <PageHeader description="Por parte del nombre, del correo o del teléfono, o por su identificador. Cada búsqueda queda registrada, y cada persona que aparece la ve en su historial." />

      <form
        onSubmit={(event) => void submit(event)}
        role="search"
        aria-label="Buscar personas"
        data-list-toolbar

        noValidate
      >
        <div data-list-search>
          <Input
            type="search"
            aria-label="Nombre, correo o teléfono"
            aria-invalid={issues.term ? true : undefined}
            aria-describedby={issues.term ? 'support-term-issue' : undefined}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Nombre, correo o teléfono"
            autoComplete="off"
            disabled={busy}
          />
          {issues.term ? <FieldError id="support-term-issue">{issues.term}</FieldError> : null}
        </div>
        <div data-list-filter>
          <Input
            aria-label="Referencia del caso (opcional)"
            aria-invalid={issues.caseReference ? true : undefined}
            aria-describedby={issues.caseReference ? 'support-case-issue' : undefined}
            value={caseReference}
            onChange={(event) => setCaseReference(event.target.value)}
            placeholder="Caso (opcional)"
            autoComplete="off"
            disabled={busy}
          />
          {issues.caseReference ? (
            <FieldError id="support-case-issue">{issues.caseReference}</FieldError>
          ) : null}
        </div>
        <Button type="submit" disabled={busy}>
          Buscar
        </Button>
      </form>

      {notice ? (
        <Alert live="polite" variant="danger">
          <AlertTitle>No se pudo buscar</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {busy ? <ScreenLoading label="Buscando" /> : null}

      {shown && shown.result.outcome === 'not_found' ? (
        <ScreenEmpty icon="search" title={`Nadie coincide con «${shown.term}»`} role="status">
          Prueba con otra parte del nombre, el correo o el teléfono. La búsqueda quedó registrada de
          todos modos.
        </ScreenEmpty>
      ) : null}

      {shown && shown.result.outcome === 'found' ? (
        <div data-list-results data-support-results>
          <p data-list-count role="status">
            {shown.result.items.length === 1
              ? '1 persona encontrada'
              : `${String(shown.result.items.length)} personas encontradas`}
          </p>
          {shown.result.has_more ? (
            <p data-list-note>
              Hay más personas que coinciden. Escribe algo más preciso para encontrarla.
            </p>
          ) : null}
          <Table scrollAreaLabel="Personas encontradas">
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Cuenta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.result.items.map((person) => (
                <TableRow key={person.person_id} data-support-result>
                  <TableCell>
                    <Link
                      href={personFileHref(person.person_id, shown.caseReference)}
                      data-support-result-link
                    >
                      {person.display_name}
                    </Link>
                  </TableCell>
                  <TableCell>{person.contact_email ?? 'Sin correo'}</TableCell>
                  <TableCell>{person.contact_phone ?? 'Sin teléfono'}</TableCell>
                  <TableCell>
                    <Badge variant={accountStatusTone(person.account_status)}>
                      {accountStatusLabel(person.account_status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return supportMetadataMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return supportMetadataMessage(error.code)
  return supportMetadataMessage('upstream-unavailable')
}
