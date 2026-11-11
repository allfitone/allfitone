'use client'

/**
 * What can be done with a published version, from its own page.
 *
 * Starting a draft from a template version (`HU-STUDIO-039`) is anybody's who
 * manages content; retiring a version (`HU-STUDIO-040`, `HU-STUDIO-043`) is
 * the owner's and the admin's. Each command is confirmed in an `AlertDialog`,
 * because what it changes is not on the page the reader is looking at.
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
import { deriveFailure, retireFailure } from '@/lib/content-version'
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

/**
 * Retiring a version, for a template (`HU-STUDIO-040`) and for a program
 * (`HU-STUDIO-043`): the same card and dialog, told apart by what each one
 * stops. Owners and admins only — the page shows a coach who can instead.
 * Both commands converge and have no way back, which the dialog says first.
 */
function RetireVersionCard({
  title,
  description,
  dialogTitle,
  dialogDescription,
  consequence,
  retire,
  onRetired,
}: {
  title: string
  description: string
  dialogTitle: string
  dialogDescription: string
  consequence: string
  retire: (command: CommandHeaders, signal: AbortSignal) => Promise<unknown>
  onRetired: (retired: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [command, setCommand] = useState(newCommand)
  const mutation = useStudioSessionMutation({
    mutationFn: ({ command }: { command: CommandHeaders }, signal) => retire(command, signal),
    onSuccess: onRetired,
  })

  async function confirm() {
    setFailure(undefined)
    try {
      await mutation.mutateAsync({ command })
      setOpen(false)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return
      }
      setFailure(retireFailure(caught instanceof StudioApiError ? caught.status : 0))
    }
  }

  return (
    <Card data-version-retire>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            // Closing mid-flight would hide a request that is still going to land.
            if (mutation.isPending) return
            setOpen(next)
            if (!next) setFailure(undefined)
          }}
        >
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Retirar esta versión
          </Button>

          <AlertDialogContent data-version-retire-dialog>
            <AlertDialogHeader>
              <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                <b>No se puede deshacer.</b> {dialogDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p>{consequence}</p>

            {failure ? (
              <Alert variant="danger" live="assertive" data-version-retire-error>
                <AlertTitle>No se retiró</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={mutation.isPending}>Mantenerla</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={mutation.isPending}
                onClick={(event) => {
                  event.preventDefault()
                  void confirm()
                }}
              >
                {mutation.isPending ? <Spinner label="Retirando" /> : null}
                {mutation.isPending ? 'Retirando…' : 'Retirar ahora'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

/**
 * `HU-STUDIO-040`. Criterion 1, no new content with it: a program draft
 * refuses a new reference to a retired version. Criterion 2, history
 * untouched: published programs, active assignments and planned sessions keep
 * naming it, because they name it by id and nothing rewrites them.
 */
export function RetireTemplateVersion({
  version,
  organizationId,
}: {
  version: SessionTemplateVersion
  organizationId: string
}) {
  const queryClient = useQueryClient()
  return (
    <RetireVersionCard
      title="Retirar esta versión"
      description="Deja de poder sumarse a programas nuevos. No altera los programas publicados, las asignaciones activas ni las sesiones planificadas: el historial no se toca. No se puede deshacer."
      dialogTitle={`¿Retirar la versión ${version.version_number} de «${version.title}»?`}
      dialogDescription="Nadie podrá sumarla a un programa nuevo."
      consequence="Los programas que ya la usan la conservan, y las asignaciones y sesiones que vienen de ellos no cambian."
      retire={(command, signal) =>
        studioApi.deprecateOrganizationSessionTemplateVersion(
          organizationId,
          version.template_id,
          version.version_number,
          command,
          signal,
        )
      }
      onRetired={(retired) => {
        queryClient.setQueryData(
          studioQueryKeys.sessionTemplateVersion(
            organizationId,
            version.template_id,
            version.version_number,
          ),
          retired,
        )
        // The library counts retired versions, and the program editor marks them.
        void queryClient.invalidateQueries({
          queryKey: studioQueryKeys.organizationSessionTemplatesRoot(organizationId),
        })
      }}
    />
  )
}
