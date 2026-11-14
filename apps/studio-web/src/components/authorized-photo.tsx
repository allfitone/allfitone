'use client'

/**
 * One photo a client shares, drawn while somebody has it open: her body photos
 * (`HU-STUDIO-052`) and the photo of a meal (`HU-STUDIO-072`). Why the image is
 * bytes from the API and never an address is in `authorized-photo.ts`.
 *
 * The caller owns the read and mounts this only while the photo is open, so
 * opening it is the request and closing it drops the bytes. The address it
 * draws from lives in this tab's memory and is revoked when the photo closes:
 * nothing is left that could be copied or opened again later.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { useEffect, useState } from 'react'

import { photoFailure } from '@/lib/authorized-photo'

export function PhotoFrame({
  isPending,
  error,
  data,
  onRetry,
  alt,
}: {
  isPending: boolean
  error: unknown
  data: Blob | undefined
  onRetry: () => void
  alt: string
}) {
  if (isPending) return <Skeleton data-authorized-photo-placeholder />
  if (error || !data) {
    // One sentence for the four reasons the API answers the same way.
    return photoFailure(error) === 'unavailable' ? (
      <Alert variant="warning" live="polite" data-authorized-photo-unavailable>
        <AlertTitle>No podemos mostrar esta foto</AlertTitle>
        <AlertDescription>
          Ya no está disponible para ti. Desde aquí no se puede saber por qué.
        </AlertDescription>
      </Alert>
    ) : (
      <Alert variant="danger" live="polite" data-authorized-photo-failure>
        <AlertTitle>No pudimos cargar la foto</AlertTitle>
        <AlertDescription>La conexión falló de forma temporal.</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  return <BlobImage blob={data} alt={alt} />
}

/**
 * Created when the bytes arrive and revoked when they go. Inside an effect so
 * that a render, which may run twice, never creates an address nobody revokes.
 */
function BlobImage({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  if (!url) return <Skeleton data-authorized-photo-placeholder />
  // Not `next/image`: there is nothing to optimise or cache, only bytes in memory.
  return <img src={url} alt={alt} data-authorized-photo-image />
}
