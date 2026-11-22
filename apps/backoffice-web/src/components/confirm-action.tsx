'use client'

/**
 * A command that cannot be taken back, or that stops someone's service, asks
 * first and says what it costs.
 *
 * Suspending a gym was one click on the same cyan button as fixing its quota,
 * with the reason already picked. Here the button that opens the question is
 * not red; the red is the answer inside, beside a way out that keeps things
 * as they are. The dialog stays open while the command runs, so it cannot
 * hide a request that is still going to land.
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
  AlertDialogTrigger,
} from '@allfitone/react/components/alert-dialog'
import { useState, type ReactElement, type ReactNode } from 'react'

export function ConfirmAction({
  trigger,
  label,
  title,
  children,
  confirmLabel,
  busyLabel,
  keepLabel,
  busy,
  canOpen = () => true,
  onConfirm,
}: {
  /** The button that asks, without its label: the dialog gives it its click. */
  trigger: ReactElement
  label: ReactNode
  title: string
  /** What it costs, in this record's numbers. */
  children: ReactNode
  confirmLabel: string
  busyLabel: string
  keepLabel: string
  busy: boolean
  /** False keeps the question closed: the screen has just said what is missing. */
  canOpen?: () => boolean
  onConfirm: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (next && !canOpen()) return
        setOpen(next)
      }}
    >
      <AlertDialogTrigger render={trigger}>{label}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{children}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter data-confirm-footer>
          <AlertDialogCancel disabled={busy}>{keepLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() => void onConfirm().then(() => setOpen(false))}
          >
            {busy ? busyLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
