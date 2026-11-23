'use client'

/**
 * An identifier where a person or a record is named by one.
 *
 * Some screens name a person only by her identifier on purpose — that is a
 * legal control, and this keeps it. What changes is the form: the 36
 * characters ran off a phone and could only be copied by selecting them by
 * hand. The short form is read, the whole one is in the title, and the button
 * hands the whole one over.
 */

import { IconButton } from '@allfitone/react/components/icon-button'
import { toast } from '@allfitone/react/components/sonner'
import { FoundationIcon } from '@allfitone/react/icons'
import Link from 'next/link'

import { shortIdentifier } from '@/lib/identifier'

export function RecordId({
  id,
  href,
  linkLabel,
}: {
  id: string
  href?: string | undefined
  linkLabel?: string | undefined
}) {
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(id)
      toast.success('Identificador copiado.')
    } catch {
      // A browser that refuses the clipboard still shows the whole value on hover.
      toast.error('No se pudo copiar. El identificador completo aparece al pasar el cursor.')
    }
  }

  const code = <code title={id}>{shortIdentifier(id)}</code>
  return (
    <span data-record-id>
      {href ? (
        <Link href={href} aria-label={linkLabel} data-record-id-link>
          {code}
        </Link>
      ) : (
        code
      )}
      <IconButton
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Copiar el identificador completo"
        onClick={() => void copy()}
      >
        <FoundationIcon name="duplicate" decorative />
      </IconButton>
    </span>
  )
}
