'use client'

/**
 * What can be done with a published version, from its own page.
 *
 * Starting a draft from a template version (`HU-STUDIO-039`) is anybody's who
 * manages content. Each command is confirmed in an `AlertDialog`, because what
 * it changes is not on the page the reader is looking at.
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
import { Button } from '@allfitone/react/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { Spinner } from '@allfitone/react/components/spinner'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import { deriveFailure } from '@/lib/content-version'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type SessionTemplateVersion,
} from '@/lib/studio-api'
import {
  isStudioQuerySessionCancelled,
  sessionTemplateDraftQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

/**
 * `HU-STUDIO-039`: a variant without rewriting it. The command replaces the
 * template's one draft with this version and records where it came from
 * (criterion 1); another organization's version is a 404 (criterion 2), and so
 * is a retired one, which is why the card is only offered on a published one.
 *
 * The draft's ETag is read fresh at the click: the dialog has said the draft
 * is replaced, so whatever it holds at that moment is what is being replaced.
 */
export function DeriveFromVersion({
  version,
  organizationId,
}: {
  version: SessionTemplateVersion
  organizationId: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [command, setCommand] = useState(newCommand)
  const templateId = version.template_id

  const derive = useStudioSessionMutation({
    mutationFn: async ({ command }: { command: CommandHeaders }, signal) => {
      const draft = await queryClient.fetchQuery({
        ...sessionTemplateDraftQueryOptions(organizationId, templateId),
        staleTime: 0,
      })
      return studioApi.deriveOrganizationSessionTemplateVersion(
        organizationId,
        templateId,
        version.version_number,
        draft.etag,
        command,
        signal,
      )
    },
    onSuccess: (draft) => {
      // The editor opens on this draft, not on the one it had cached.
      queryClient.setQueryData(
        studioQueryKeys.sessionTemplateDraft(organizationId, templateId),
        draft,
      )
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationSessionTemplatesRoot(organizationId),
      })
    },
  })

  async function confirm() {
    setFailure(undefined)
    try {
      await derive.mutateAsync({ command })
      router.push(`/organizations/${organizationId}/content/templates/${templateId}`)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return
      }
      // Somebody saved the draft between the read and the command: a new try reads it again.
      if (caught instanceof StudioApiError && caught.code === 'stale-draft') {
        setCommand(newCommand())
        setFailure(
          'Alguien guardó el borrador justo ahora. Si vuelves a confirmar, también se reemplaza eso.',
        )
        return
      }
      setFailure(deriveFailure(caught instanceof StudioApiError ? caught.status : 0))
    }
  }

  return (
    <Card data-version-derive>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Partir de esta versión
        </CardTitle>
        <CardDescription>
          Para hacer una variante sin rehacerla: el borrador de la plantilla pasa a tener este
          contenido y queda anotado que parte de la versión {version.version_number}. Esta versión
          no cambia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            if (derive.isPending) return
            setOpen(next)
            if (!next) setFailure(undefined)
          }}
        >
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Partir de esta versión
          </Button>

          <AlertDialogContent data-version-derive-dialog>
            <AlertDialogHeader>
              <AlertDialogTitle>
                ¿Reemplazar el borrador con la versión {version.version_number}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                <b>Lo que el borrador tenga ahora sin publicar se pierde.</b> Las versiones
                publicadas no cambian.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {failure ? (
              <Alert variant="danger" live="assertive" data-version-derive-error>
                <AlertTitle>No se reemplazó el borrador</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={derive.isPending}>
                Conservar el borrador
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={derive.isPending}
                onClick={(event) => {
                  event.preventDefault()
                  void confirm()
                }}
              >
                {derive.isPending ? <Spinner label="Reemplazando el borrador" /> : null}
                {derive.isPending ? 'Reemplazando…' : 'Reemplazar el borrador'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
