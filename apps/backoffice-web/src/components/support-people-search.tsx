'use client'

/**
 * `HU-BO-006` — finding a person to help them.
 *
 * Three things about this screen are rules rather than layout.
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
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
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

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  type SupportPeopleSearch,
} from '@/lib/backoffice-api'
import {
  isSearchable,
  isValidOptionalCaseReference,
  supportMetadataMessage,
} from '@/lib/support-metadata'

import { ScreenEmpty, ScreenLoading } from './screen-state'

export function SupportPeopleSearch() {
  const router = useRouter()
  const parameters = useSearchParams()
  const [caseReference, setCaseReference] = useState(parameters.get('case_reference') ?? '')
  const [term, setTerm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SupportPeopleSearch | null>(null)
  const [searched, setSearched] = useState<{ term: string; caseReference: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const reference = caseReference.trim()
    const wanted = term.trim()
    if (!isSearchable(wanted)) {
      setError('Escribe al menos dos caracteres del nombre, el correo o el teléfono.')
      return
    }
    if (!isValidOptionalCaseReference(reference)) {
      setError('La referencia del caso va en mayúsculas, como CASE-2026-001, o se deja vacía.')
      return
    }

    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const found = await backofficeApi.searchSupportPeople({
        query: wanted,
        caseReference: reference,
      })
      setResult(found)
      setSearched({ term: wanted, caseReference: reference })
      // The reference survives a reload and travels to the file, which records it too.
      router.replace(
        reference ? `/people?case_reference=${encodeURIComponent(reference)}` : '/people',
      )
    } catch (failure) {
      setResult(null)
      setNotice(failureMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-support-search>
      {notice ? (
        <Alert live="polite" variant="danger">
          <AlertTitle>No se pudo buscar</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Buscar a una persona
          </CardTitle>
          <CardDescription>
            Por parte del nombre, del correo o del teléfono, o por su identificador. Cada búsqueda
            queda registrada, y cada persona que aparece en el resultado la ve en su historial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} data-backoffice-form data-support-search-form noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="support-term">Nombre, correo o teléfono</FieldLabel>
                <Input
                  id="support-term"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Gómez, gomez@correo.com o 3001234"
                  autoComplete="off"
                  disabled={busy}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="support-case">Referencia del caso (opcional)</FieldLabel>
                <Input
                  id="support-case"
                  value={caseReference}
                  onChange={(event) => setCaseReference(event.target.value)}
                  placeholder="CASE-2026-001"
                  autoComplete="off"
                  disabled={busy}
                />
              </Field>
              {error ? <FieldError>{error}</FieldError> : null}
              <div data-form-actions>
                <Button type="submit" disabled={busy}>
                  Buscar
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {busy ? <ScreenLoading label="Buscando" /> : null}

      {result && result.outcome === 'not_found' && searched ? (
        <ScreenEmpty icon="search" title={`Nadie coincide con «${searched.term}»`} role="status">
          Prueba con otra parte del nombre, el correo o el teléfono. La búsqueda quedó registrada de
          todos modos.
        </ScreenEmpty>
      ) : null}

      {result && result.outcome === 'found' && searched ? (
        <Card data-support-results>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              {result.items.length === 1
                ? '1 persona encontrada'
                : `${String(result.items.length)} personas encontradas`}
            </CardTitle>
            <CardDescription>
              {result.has_more
                ? 'Hay más personas que coinciden. Escribe algo más preciso para encontrarla.'
                : 'Abre su ficha para ver su cuenta, sus pagos y su recuperación de acceso.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                {result.items.map((person) => (
                  <TableRow key={person.person_id} data-support-result>
                    <TableCell>
                      <Link
                        href={fileHref(person.person_id, searched.caseReference)}
                        data-support-result-link
                      >
                        {person.display_name}
                      </Link>
                    </TableCell>
                    <TableCell>{person.contact_email ?? 'Sin correo'}</TableCell>
                    <TableCell>{person.contact_phone ?? 'Sin teléfono'}</TableCell>
                    <TableCell>
                      <Badge variant={person.account_status === 'active' ? 'success' : 'secondary'}>
                        {person.account_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function fileHref(personId: string, caseReference: string): string {
  return caseReference
    ? `/people/${personId}?case_reference=${encodeURIComponent(caseReference)}`
    : `/people/${personId}`
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return supportMetadataMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return supportMetadataMessage(error.code)
  return supportMetadataMessage('upstream-unavailable')
}
